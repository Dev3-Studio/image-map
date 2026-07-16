import * as path from 'node:path'
import {fileURLToPath} from 'node:url'
import * as cdk from 'aws-cdk-lib'
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2'
import {HttpIamAuthorizer} from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import {HttpLambdaIntegration} from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb'
import * as ecrAssets from 'aws-cdk-lib/aws-ecr-assets'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources'
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as sqs from 'aws-cdk-lib/aws-sqs'
import type {Construct} from 'constructs'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(currentDirectory, '../../..')

export class CollageGenerationStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props)

        const inputBucket = new s3.Bucket(this, 'SnapshotInputBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        })
        const releaseBucket = new s3.Bucket(this, 'ReleaseBucket', {
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            encryption: s3.BucketEncryption.S3_MANAGED,
            enforceSSL: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
        })

        const corsHeaders = new cloudfront.ResponseHeadersPolicy(this, 'PublicReleaseCors', {
            corsBehavior: {
                accessControlAllowCredentials: false,
                accessControlAllowHeaders: ['*'],
                accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
                accessControlAllowOrigins: ['*'],
                originOverride: true,
            },
        })
        const releaseOrigin = origins.S3BucketOrigin.withOriginAccessControl(releaseBucket)
        const distribution = new cloudfront.Distribution(this, 'ReleaseDistribution', {
            defaultBehavior: {
                origin: releaseOrigin,
                allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
                responseHeadersPolicy: corsHeaders,
                viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
            },
            additionalBehaviors: {
                'current.json': {
                    origin: releaseOrigin,
                    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
                    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
                    responseHeadersPolicy: corsHeaders,
                    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                },
            },
        })

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
                INPUT_BUCKET_NAME: inputBucket.bucketName,
                JOBS_TABLE_NAME: jobsTable.tableName,
            },
        })
        apiHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [inputBucket.arnForObjects('snapshots/*/snapshot.json')],
        }))
        apiHandler.addToRolePolicy(new iam.PolicyStatement({
            actions: ['dynamodb:GetItem', 'dynamodb:TransactWriteItems'],
            resources: [jobsTable.tableArn],
        }))

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

        const releaseBaseUrl = `https://${distribution.distributionDomainName}`
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
                INPUT_BUCKET_NAME: inputBucket.bucketName,
                RELEASE_BUCKET_NAME: releaseBucket.bucketName,
                JOBS_TABLE_NAME: jobsTable.tableName,
                RELEASE_BASE_URL: releaseBaseUrl,
                SOURCE_BATCH_SIZE: '4',
                ARTIFACT_UPLOAD_CONCURRENCY: '16',
            },
        })
        worker.addToRolePolicy(new iam.PolicyStatement({
            actions: ['s3:GetObject'],
            resources: [inputBucket.arnForObjects('snapshots/*')],
        }))
        worker.addToRolePolicy(new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [
                releaseBucket.arnForObjects('releases/*'),
                releaseBucket.arnForObjects('current.json'),
            ],
        }))
        worker.addToRolePolicy(new iam.PolicyStatement({
            actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'],
            resources: [jobsTable.tableArn],
        }))
        worker.addEventSource(new lambdaEventSources.SqsEventSource(generationQueue, {
            batchSize: 1,
            reportBatchItemFailures: true,
        }))

        const api = new apigatewayv2.HttpApi(this, 'RegenerationApi')
        const integration = new HttpLambdaIntegration('RegenerationApiIntegration', apiHandler)
        const authorizer = new HttpIamAuthorizer()
        api.addRoutes({
            path: '/regenerations',
            methods: [apigatewayv2.HttpMethod.POST],
            integration,
            authorizer,
        })
        api.addRoutes({
            path: '/regenerations/{jobId}',
            methods: [apigatewayv2.HttpMethod.GET],
            integration,
            authorizer,
        })

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

        new cdk.CfnOutput(this, 'RegenerationApiUrl', {value: api.apiEndpoint})
        new cdk.CfnOutput(this, 'SnapshotInputBucketName', {value: inputBucket.bucketName})
        new cdk.CfnOutput(this, 'ReleaseBaseUrl', {value: releaseBaseUrl})
    }
}
