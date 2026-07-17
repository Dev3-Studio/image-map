import type {DynamoDBStreamHandler} from 'aws-lambda'
import type {AttributeValue} from '@aws-sdk/client-dynamodb'
import {unmarshall} from '@aws-sdk/util-dynamodb'
import {SendMessageCommand, SQSClient} from '@aws-sdk/client-sqs'
import type {JobRecord} from './contracts.js'

const queueUrl = process.env.QUEUE_URL
if (!queueUrl) {
    throw new Error('Missing QUEUE_URL')
}

const sqs = new SQSClient({})

export const handler: DynamoDBStreamHandler = async (event) => {
    const jobs = event.Records.flatMap((record) => {
        if (record.eventName !== 'INSERT' || !record.dynamodb?.NewImage) {
            return []
        }
        const item = unmarshall(
            record.dynamodb.NewImage as unknown as Record<string, AttributeValue>,
        ) as JobRecord
        return item.entityType === 'JOB' && item.status === 'QUEUED' ? [item] : []
    })

    await Promise.all(jobs.map((job) => sqs.send(new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
            jobId: job.jobId,
            sourceRevision: job.sourceRevision,
            snapshotETag: job.snapshotETag,
        }),
        MessageGroupId: 'collage',
        MessageDeduplicationId: job.jobId,
    }))))

    jobs.forEach((job) => {
        console.info(JSON.stringify({event: 'job_dispatched', jobId: job.jobId}))
    })
}
