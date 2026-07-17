import {createHash} from 'node:crypto'
import type {APIGatewayProxyHandlerV2} from 'aws-lambda'
import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {HeadObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {
    DynamoDBDocumentClient,
    GetCommand,
    TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb'
import {
    JOB_ID_PATTERN,
    publicJob,
    SOURCE_REVISION_PATTERN,
    type JobRecord,
    type RegenerationRequest,
} from './contracts.js'

const tableName = requiredEnvironment('JOBS_TABLE_NAME')
const r2BucketName = requiredEnvironment('R2_BUCKET_NAME')
const dynamodb = DynamoDBDocumentClient.from(new DynamoDBClient({}))
const s3 = new S3Client({
    region: 'auto',
    endpoint: requiredEnvironment('R2_ENDPOINT'),
    forcePathStyle: true,
    credentials: {
        accessKeyId: requiredEnvironment('R2_ACCESS_KEY_ID'),
        secretAccessKey: requiredEnvironment('R2_SECRET_ACCESS_KEY'),
    },
})

function requiredEnvironment(name: string) {
    const value = process.env[name]
    if (!value) {
        throw new Error(`Missing ${name}`)
    }
    return value
}

function response(statusCode: number, body: unknown) {
    return {
        statusCode,
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(body),
    }
}

function normalizeEtag(etag: string | undefined) {
    return etag?.replaceAll('"', '') ?? ''
}

async function getJob(jobId: string) {
    const result = await dynamodb.send(new GetCommand({
        TableName: tableName,
        Key: {id: `JOB#${jobId}`},
        ConsistentRead: true,
    }))
    return result.Item as JobRecord | undefined
}

async function enqueue(sourceRevision: string) {
    if (!SOURCE_REVISION_PATTERN.test(sourceRevision)) {
        return response(400, {code: 'INVALID_SOURCE_REVISION'})
    }

    const snapshotKey = `snapshots/${sourceRevision}/snapshot.json`
    let snapshotETag: string
    try {
        const head = await s3.send(new HeadObjectCommand({
            Bucket: r2BucketName,
            Key: snapshotKey,
        }))
        snapshotETag = normalizeEtag(head.ETag)
    } catch (error) {
        console.warn(JSON.stringify({event: 'snapshot_not_found', sourceRevision, error}))
        return response(404, {code: 'SNAPSHOT_NOT_FOUND'})
    }

    const jobId = createHash('sha256').update(sourceRevision).digest('hex')
    const existing = await getJob(jobId)
    if (existing) {
        if (existing.snapshotETag !== snapshotETag) {
            return response(409, {code: 'REVISION_NOT_IMMUTABLE'})
        }
        return response(202, publicJob(existing))
    }

    const now = new Date().toISOString()
    const job: JobRecord = {
        id: `JOB#${jobId}`,
        entityType: 'JOB',
        jobId,
        sourceRevision,
        snapshotETag,
        snapshotKey,
        status: 'QUEUED',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    }

    try {
        await dynamodb.send(new TransactWriteCommand({
            TransactItems: [
                {
                    Put: {
                        TableName: tableName,
                        Item: job,
                        ConditionExpression: 'attribute_not_exists(id)',
                    },
                },
                {
                    Put: {
                        TableName: tableName,
                        Item: {
                            id: 'HEAD',
                            entityType: 'HEAD',
                            latestJobId: jobId,
                            sourceRevision,
                            updatedAt: now,
                        },
                    },
                },
            ],
        }))
    } catch (error) {
        const racedJob = await getJob(jobId)
        if (racedJob?.snapshotETag === snapshotETag) {
            return response(202, publicJob(racedJob))
        }
        console.error(JSON.stringify({event: 'enqueue_failed', sourceRevision, jobId, error}))
        return response(500, {code: 'ENQUEUE_FAILED'})
    }

    console.info(JSON.stringify({event: 'job_queued', sourceRevision, jobId}))
    return response(202, publicJob(job))
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const method = event.requestContext.http.method
    if (method === 'POST' && event.rawPath === '/regenerations') {
        let body: RegenerationRequest
        try {
            body = JSON.parse(event.body ?? '{}') as RegenerationRequest
        } catch {
            return response(400, {code: 'INVALID_JSON'})
        }
        return enqueue(body.sourceRevision)
    }

    if (method === 'GET') {
        const jobId = event.pathParameters?.jobId ?? ''
        if (!JOB_ID_PATTERN.test(jobId)) {
            return response(400, {code: 'INVALID_JOB_ID'})
        }
        const job = await getJob(jobId)
        return job
            ? response(200, publicJob(job))
            : response(404, {code: 'JOB_NOT_FOUND'})
    }

    return response(404, {code: 'NOT_FOUND'})
}
