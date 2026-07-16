export const SOURCE_REVISION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
export const JOB_ID_PATTERN = /^[a-f0-9]{64}$/

export type JobStatus =
    | 'QUEUED'
    | 'RUNNING'
    | 'RETRYING'
    | 'SUCCEEDED'
    | 'SUPERSEDED'
    | 'FAILED'

export interface JobRecord {
    id: string
    entityType: 'JOB'
    jobId: string
    sourceRevision: string
    snapshotETag: string
    snapshotKey: string
    status: JobStatus
    attempts: number
    createdAt: string
    updatedAt: string
    expiresAt: number
    releaseUrl?: string
    failureCode?: string
}

export interface RegenerationRequest {
    sourceRevision: string
}

export function publicJob(record: JobRecord) {
    return {
        jobId: record.jobId,
        sourceRevision: record.sourceRevision,
        status: record.status,
        attempts: record.attempts,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        releaseUrl: record.releaseUrl,
        failureCode: record.failureCode,
    }
}
