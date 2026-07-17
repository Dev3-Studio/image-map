import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import * as cdk from 'aws-cdk-lib'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import type {Construct} from 'constructs'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(currentDirectory, '../../..')

export class CollageGenerationStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        const r2Endpoint = new cdk.CfnParameter(this, 'R2Endpoint', {
            type: 'String',
            default: 'https://fdd02276a217dc327a0724e2afbd23ea.r2.cloudflarestorage.com',
            description: 'Cloudflare R2 S3-compatible endpoint.',
        })
        const r2BucketName = new cdk.CfnParameter(this, 'R2BucketName', {
            type: 'String',
            default: 'tiling-demo',
            description: 'Existing R2 bucket used for snapshots and generated releases.',
        })
        const r2PublicBaseUrl = new cdk.CfnParameter(this, 'R2PublicBaseUrl', {
            type: 'String',
            default: 'https://pub-78666f1dd7984ef69f57781fac523d68.r2.dev',
            description: 'Public base URL for the R2 bucket, without a trailing slash.',
        })
        const r2AccessKeyId = new cdk.CfnParameter(this, 'R2AccessKeyId', {
            type: 'String',
            noEcho: true,
            description: 'R2 S3 API access key ID. Supply this only at deployment time.',
        })
        const r2SecretAccessKey = new cdk.CfnParameter(this, 'R2SecretAccessKey', {
            type: 'String',
            noEcho: true,
            description: 'R2 S3 API secret access key. Supply this only at deployment time.',
        })
        const r2Environment = {
            R2_ACCESS_KEY_ID: r2AccessKeyId.valueAsString,
            R2_BUCKET_NAME: r2BucketName.valueAsString,
            R2_ENDPOINT: r2Endpoint.valueAsString,
            R2_SECRET_ACCESS_KEY: r2SecretAccessKey.valueAsString,
        }

        const jobsTable = new dynamodb.Table(this, 'JobsTable', {
            partitionKey: {name: 'id', type: dynamodb.AttributeType.STRING},
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
            timeToLiveAttribute: 'expiresAt',
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        })

        const deadLetterQueue = new sqs.Queue(this, 'GenerationDeadLetterQueue', {
            fifo: true,
            retentionPeriod: cdk.Duration.days(14),
        })
        const generationQueue = new sqs.Queue(this, 'GenerationQueue', {
            fifo: true,
            contentBasedDeduplication: false,
            visibilityTimeout: cdk.Duration.minutes(90),
            deadLetterQueue: {
                queue: deadLetterQueue,
                maxReceiveCount: 5,
            },
        })

        const handlerCode = lambda.Code.fromAsset(
            path.join(workspaceRoot, 'infra/collage-generation'),
            {
                exclude: [
                    'bin',
                    'cdk.out',
                    'lib',
                    'node_modules',
                    'src',
                    'tsconfig*.json',
                ],
            },
        )
        const apiHandler = new lambda.Function(this, 'RegenerationApiHandler', {
            code: handlerCode,
            handler: 'dist/handlers/api.handler',
            runtime: lambda.Runtime.NODEJS_24_X,
            timeout: cdk.Duration.seconds(15),
            environment: {
                ...r2Environment,
                JOBS_TABLE_NAME: jobsTable.tableName,
            },
        })
        apiHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['dynamodb:GetItem', 'dynamodb:TransactWriteItems'],
            resources: [jobsTable.tableArn],
        }))
        const functionUrl = apiHandler.addFunctionUrl({
            authType: lambda.FunctionUrlAuthType.AWS_IAM,
        })

        const dispatcher = new lambda.Function(this, 'JobDispatcher', {
            code: handlerCode,
            handler: 'dist/handlers/dispatch.handler',
            runtime: lambda.Runtime.NODEJS_24_X,
            timeout: cdk.Duration.seconds(30),
            environment: {QUEUE_URL: generationQueue.queueUrl},
        })
        generationQueue.grantSendMessages(dispatcher)
        dispatcher.addEventSource(new lambdaEventSources.DynamoEventSource(jobsTable, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            bisectBatchOnError: true,
            retryAttempts: 10,
        }))

        const worker = new lambda.DockerImageFunction(this, 'GenerationWorker', {
            code: lambda.DockerImageCode.fromImageAsset(
                path.join(workspaceRoot, 'tools/collage-maker'),
                {
                    file: 'Dockerfile.lambda',
                    platform: ecrAssets.Platform.LINUX_AMD64,
                },
            ),
            architecture: lambda.Architecture.X86_64,
            memorySize: 10_240,
            timeout: cdk.Duration.seconds(900),
            ephemeralStorageSize: cdk.Size.mebibytes(1024),
            reservedConcurrentExecutions: 1,
            environment: {
                ...r2Environment,
                JOBS_TABLE_NAME: jobsTable.tableName,
                RELEASE_BASE_URL: r2PublicBaseUrl.valueAsString,
                SOURCE_BATCH_SIZE: '4',
                ARTIFACT_UPLOAD_CONCURRENCY: '16',
            },
        })
        worker.addToRolePolicy(new iam.PolicyStatement({
            actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
            resources: [jobsTable.tableArn],
        }))
        worker.addEventSource(new lambdaEventSources.SqsEventSource(generationQueue, {
            batchSize: 1,
            reportBatchItemFailures: true,
        }))

        new cloudwatch.Alarm(this, 'GenerationWorkerErrors', {
            metric: worker.metricErrors({period: cdk.Duration.minutes(5)}),
            threshold: 1,
            evaluationPeriods: 1,
        })
        new cloudwatch.Alarm(this, 'GenerationWorkerDuration', {
            metric: worker.metricDuration({period: cdk.Duration.minutes(5)}),
            threshold: 12 * 60 * 1000,
            evaluationPeriods: 1,
        })
        new cloudwatch.Alarm(this, 'GenerationDeadLetters', {
            metric: deadLetterQueue.metricApproximateNumberOfMessagesVisible({
                period: cdk.Duration.minutes(5),
            }),
            threshold: 1,
            evaluationPeriods: 1,
        })

        new cdk.CfnOutput(this, 'RegenerationFunctionUrl', {value: functionUrl.url})
        new cdk.CfnOutput(this, 'R2Bucket', {value: r2BucketName.valueAsString})
        new cdk.CfnOutput(this, 'ReleaseBaseUrl', {value: r2PublicBaseUrl.valueAsString})
    }
}
