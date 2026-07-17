import {createPublicKey, verify as verifySignature} from 'node:crypto'
import type {APIGatewayProxyHandlerV2} from 'aws-lambda'
import {DynamoDBClient} from '@aws-sdk/client-dynamodb'
import {PutObjectCommand, S3Client} from '@aws-sdk/client-s3'
import {
    DynamoDBDocumentClient,
    GetCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

const CANDY_GUARD_PROGRAM_ID = 'Guard1JwRhJkVH6XZhzoYxeBVQe872VH6QggF4BWmS9g'
const MAX_AUTH_AGE_MS = 5 * 60 * 1000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_TILE_INDEX = 9_999
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const tableName = requiredEnvironment('CLAIMS_TABLE_NAME')
const candyMachineId = requiredEnvironment('CANDY_MACHINE_ID')
const rpcEndpoint = requiredEnvironment('SOLANA_RPC_ENDPOINT')
const r2BucketName = requiredEnvironment('R2_BUCKET_NAME')
const r2PublicBaseUrl = requiredEnvironment('R2_PUBLIC_BASE_URL').replace(/\/$/, '')
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

interface TileRecord {
    id: string
    entityType: 'TILE'
    tileIndex: number
    reservedBy?: string
    reservationExpiresAt?: number
    mint?: string
    mintTransaction?: string
    imageKey?: string
    imageRevision?: number
    claimedAt?: string
    updatedAt?: string
}

interface SignedRequest {
    wallet?: string
    expiresAt?: number
    signature?: string
}

interface FinalizeRequest extends SignedRequest {
    mint?: string
    transaction?: string
    image?: string
}

interface RpcResponse<T> {
    error?: {message?: string}
    result?: T
}

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
        headers: {
            'access-control-allow-origin': process.env.WEB_APP_ORIGIN ?? '*',
            'cache-control': 'no-store',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    }
}

function parseJson<T>(body: string | undefined) {
    try {
        return JSON.parse(body ?? '{}') as T
    } catch {
        return null
    }
}

function decodeBase58(value: string) {
    let bytes = [0]
    for (const character of value) {
        const digit = BASE58_ALPHABET.indexOf(character)
        if (digit < 0) {
            throw new Error('INVALID_BASE58')
        }
        let carry = digit
        for (let index = 0; index < bytes.length; index += 1) {
            const next = bytes[index] * 58 + carry
            bytes[index] = next & 0xff
            carry = next >> 8
        }
        while (carry > 0) {
            bytes.push(carry & 0xff)
            carry >>= 8
        }
    }
    for (let index = 0; index < value.length - 1 && value[index] === '1'; index += 1) {
        bytes.push(0)
    }
    return Buffer.from(bytes.reverse())
}

function authMessage(action: 'reserve' | 'claim' | 'edit', tileIndex: number, body: SignedRequest, details = '') {
    return [
        'Tessera tile authorization',
        `Action: ${action}`,
        `Tile: ${tileIndex}`,
        `Wallet: ${body.wallet}`,
        `Expires: ${body.expiresAt}`,
        details,
    ].filter(Boolean).join('\n')
}

function authorize(
    action: 'reserve' | 'claim' | 'edit',
    tileIndex: number,
    body: SignedRequest,
    details = '',
) {
    if (!body.wallet || !body.signature || !Number.isSafeInteger(body.expiresAt)) {
        return false
    }
    const now = Date.now()
    if (body.expiresAt! < now || body.expiresAt! > now + MAX_AUTH_AGE_MS) {
        return false
    }

    try {
        const wallet = decodeBase58(body.wallet)
        if (wallet.length !== 32) {
            return false
        }
        const publicKey = createPublicKey({
            key: Buffer.concat([
                Buffer.from('302a300506032b6570032100', 'hex'),
                wallet,
            ]),
            format: 'der',
            type: 'spki',
        })
        return verifySignature(
            null,
            Buffer.from(authMessage(action, tileIndex, body, details)),
            publicKey,
            Buffer.from(body.signature, 'base64'),
        )
    } catch {
        return false
    }
}

async function rpc<T>(method: string, params: unknown[]) {
    const rpcResponse = await fetch(rpcEndpoint, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
        signal: AbortSignal.timeout(8_000),
    })
    const payload = await rpcResponse.json() as RpcResponse<T>
    if (!rpcResponse.ok || payload.error || payload.result === undefined) {
        throw new Error(payload.error?.message ?? 'SOLANA_RPC_FAILED')
    }
    return payload.result
}

async function getCurrentOwner(mint: string) {
    const largest = await rpc<{value: Array<{address: string, amount: string}>}>(
        'getTokenLargestAccounts',
        [mint, {commitment: 'confirmed'}],
    )
    const tokenAccount = largest.value.find((account) => account.amount === '1')
    if (!tokenAccount) {
        return null
    }
    const account = await rpc<{value: {data: {parsed?: {info?: {owner?: string}}}} | null}>(
        'getAccountInfo',
        [tokenAccount.address, {encoding: 'jsonParsed', commitment: 'confirmed'}],
    )
    return account.value?.data.parsed?.info?.owner ?? null
}

async function verifyCandyMachineMint(transaction: string, mint: string, wallet: string) {
    const result = await rpc<{
        meta: {
            err: unknown
            logMessages?: string[]
            postTokenBalances?: Array<{
                mint: string
                owner?: string
                uiTokenAmount: {amount: string, decimals: number}
            }>
        } | null
        transaction: {
            message: {
                accountKeys: Array<string | {pubkey: string, signer?: boolean}>
            }
        }
    } | null>('getTransaction', [transaction, {
        commitment: 'confirmed',
        encoding: 'jsonParsed',
        maxSupportedTransactionVersion: 0,
    }])
    if (!result?.meta || result.meta.err) {
        return false
    }

    const accountKeys = result.transaction.message.accountKeys.map((account) =>
        typeof account === 'string' ? account : account.pubkey)
    const walletSigned = result.transaction.message.accountKeys.some((account) =>
        typeof account !== 'string' && account.pubkey === wallet && account.signer === true)
    const mintedToWallet = result.meta.postTokenBalances?.some((balance) =>
        balance.mint === mint &&
        balance.owner === wallet &&
        balance.uiTokenAmount.amount === '1' &&
        balance.uiTokenAmount.decimals === 0)
    const invokedCandyGuard = result.meta.logMessages?.some((message) =>
        message.startsWith(`Program ${CANDY_GUARD_PROGRAM_ID} invoke`))

    return Boolean(
        walletSigned &&
        mintedToWallet &&
        invokedCandyGuard &&
        accountKeys.includes(candyMachineId) &&
        accountKeys.includes(mint),
    )
}

function decodeImage(image: string | undefined) {
    if (!image) {
        return null
    }
    const match = image.match(/^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/)
    if (!match) {
        return null
    }
    const bytes = Buffer.from(match[2], 'base64')
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
        return null
    }
    return {bytes, contentType: match[1]}
}

async function moderateImage(image: string) {
    const openAiResponse = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${requiredEnvironment('OPENAI_API_KEY')}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: 'omni-moderation-latest',
            input: [{type: 'image_url', image_url: {url: image}}],
        }),
        signal: AbortSignal.timeout(8_000),
    })
    const payload = await openAiResponse.json() as {
        results?: Array<{categories?: Record<string, boolean>}>
    }
    if (!openAiResponse.ok || !payload.results?.[0]?.categories) {
        throw new Error('MODERATION_FAILED')
    }
    return !Object.entries(payload.results[0].categories).some(([category, flagged]) =>
        category.startsWith('sexual') && flagged)
}

async function getTile(tileIndex: number) {
    const result = await dynamodb.send(new GetCommand({
        TableName: tableName,
        Key: {id: `TILE#${tileIndex}`},
        ConsistentRead: true,
    }))
    return result.Item as TileRecord | undefined
}

async function publicTile(record: TileRecord | undefined) {
    if (!record?.mint) {
        return {claimed: false}
    }
    return {
        claimed: true,
        tileIndex: record.tileIndex,
        mint: record.mint,
        owner: await getCurrentOwner(record.mint),
        imageUrl: record.imageKey ? `${r2PublicBaseUrl}/${record.imageKey}` : null,
        claimedAt: record.claimedAt,
        updatedAt: record.updatedAt,
    }
}

async function reserve(tileIndex: number, body: SignedRequest) {
    if (!authorize('reserve', tileIndex, body)) {
        return response(401, {code: 'INVALID_WALLET_SIGNATURE'})
    }
    const reservationExpiresAt = Date.now() + MAX_AUTH_AGE_MS
    try {
        await dynamodb.send(new UpdateCommand({
            TableName: tableName,
            Key: {id: `TILE#${tileIndex}`},
            UpdateExpression: 'SET entityType = :entityType, tileIndex = :tileIndex, reservedBy = :wallet, reservationExpiresAt = :reservationExpiresAt',
            ConditionExpression: 'attribute_not_exists(mint) AND (attribute_not_exists(reservationExpiresAt) OR reservationExpiresAt < :now OR reservedBy = :wallet)',
            ExpressionAttributeValues: {
                ':entityType': 'TILE',
                ':tileIndex': tileIndex,
                ':wallet': body.wallet,
                ':reservationExpiresAt': reservationExpiresAt,
                ':now': Date.now(),
            },
        }))
        return response(201, {reservationExpiresAt})
    } catch (error) {
        console.warn(JSON.stringify({event: 'tile_reservation_failed', tileIndex, error}))
        return response(409, {code: 'TILE_UNAVAILABLE'})
    }
}

async function finalize(tileIndex: number, body: FinalizeRequest) {
    const details = `Mint: ${body.mint}\nTransaction: ${body.transaction}`
    if (!body.mint || !body.transaction || !authorize('claim', tileIndex, body, details)) {
        return response(401, {code: 'INVALID_WALLET_SIGNATURE'})
    }
    const existing = await getTile(tileIndex)
    if (existing?.mint) {
        return existing.mint === body.mint
            ? response(200, await publicTile(existing))
            : response(409, {code: 'TILE_ALREADY_CLAIMED'})
    }
    if (
        existing?.reservedBy !== body.wallet ||
        !existing?.reservationExpiresAt ||
        existing.reservationExpiresAt < Date.now()
    ) {
        return response(409, {code: 'RESERVATION_EXPIRED'})
    }
    if (!await verifyCandyMachineMint(body.transaction, body.mint, body.wallet!)) {
        return response(422, {code: 'INVALID_CANDY_MACHINE_MINT'})
    }
    const image = decodeImage(body.image)
    if (!image) {
        return response(413, {code: 'INVALID_IMAGE'})
    }
    if (!await moderateImage(body.image!)) {
        return response(422, {code: 'IMAGE_BLOCKED'})
    }

    const now = new Date().toISOString()
    const imageKey = `tiles/${tileIndex}/${body.mint}/1.webp`
    await s3.send(new PutObjectCommand({
        Bucket: r2BucketName,
        Key: imageKey,
        Body: image.bytes,
        ContentType: image.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }))
    try {
        const result = await dynamodb.send(new UpdateCommand({
            TableName: tableName,
            Key: {id: `TILE#${tileIndex}`},
            UpdateExpression: 'SET mint = :mint, mintTransaction = :transaction, imageKey = :imageKey, imageRevision = :revision, claimedAt = :now, updatedAt = :now REMOVE reservedBy, reservationExpiresAt',
            ConditionExpression: 'attribute_not_exists(mint) AND reservedBy = :wallet AND reservationExpiresAt >= :timestamp',
            ExpressionAttributeValues: {
                ':mint': body.mint,
                ':transaction': body.transaction,
                ':imageKey': imageKey,
                ':revision': 1,
                ':now': now,
                ':wallet': body.wallet,
                ':timestamp': Date.now(),
            },
            ReturnValues: 'ALL_NEW',
        }))
        return response(201, await publicTile(result.Attributes as TileRecord))
    } catch (error) {
        console.error(JSON.stringify({event: 'tile_finalize_failed', tileIndex, mint: body.mint, error}))
        return response(409, {code: 'TILE_FINALIZE_CONFLICT'})
    }
}

async function edit(tileIndex: number, body: SignedRequest & {image?: string}) {
    if (!authorize('edit', tileIndex, body)) {
        return response(401, {code: 'INVALID_WALLET_SIGNATURE'})
    }
    const record = await getTile(tileIndex)
    if (!record?.mint) {
        return response(404, {code: 'TILE_NOT_CLAIMED'})
    }
    if (await getCurrentOwner(record.mint) !== body.wallet) {
        return response(403, {code: 'NFT_OWNERSHIP_REQUIRED'})
    }
    const image = decodeImage(body.image)
    if (!image) {
        return response(413, {code: 'INVALID_IMAGE'})
    }
    if (!await moderateImage(body.image!)) {
        return response(422, {code: 'IMAGE_BLOCKED'})
    }

    const revision = (record.imageRevision ?? 0) + 1
    const imageKey = `tiles/${tileIndex}/${record.mint}/${revision}.webp`
    const now = new Date().toISOString()
    await s3.send(new PutObjectCommand({
        Bucket: r2BucketName,
        Key: imageKey,
        Body: image.bytes,
        ContentType: image.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
    }))
    const result = await dynamodb.send(new UpdateCommand({
        TableName: tableName,
        Key: {id: `TILE#${tileIndex}`},
        UpdateExpression: 'SET imageKey = :imageKey, imageRevision = :revision, updatedAt = :now',
        ConditionExpression: 'mint = :mint AND (attribute_not_exists(imageRevision) OR imageRevision = :previousRevision)',
        ExpressionAttributeValues: {
            ':imageKey': imageKey,
            ':revision': revision,
            ':previousRevision': record.imageRevision ?? 0,
            ':now': now,
            ':mint': record.mint,
        },
        ReturnValues: 'ALL_NEW',
    }))
    return response(200, await publicTile(result.Attributes as TileRecord))
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
    const match = event.rawPath.match(/^\/tiles\/(\d+)(?:\/(reservations|claim|image))?\/?$/)
    const tileIndex = match ? Number(match[1]) : -1
    if (!match || !Number.isSafeInteger(tileIndex) || tileIndex < 0 || tileIndex > MAX_TILE_INDEX) {
        return response(404, {code: 'NOT_FOUND'})
    }

    try {
        const method = event.requestContext.http.method
        if (method === 'GET' && !match[2]) {
            return response(200, await publicTile(await getTile(tileIndex)))
        }
        const body = parseJson<FinalizeRequest>(event.body)
        if (!body) {
            return response(400, {code: 'INVALID_JSON'})
        }
        if (method === 'POST' && match[2] === 'reservations') {
            return reserve(tileIndex, body)
        }
        if (method === 'POST' && match[2] === 'claim') {
            return finalize(tileIndex, body)
        }
        if (method === 'PUT' && match[2] === 'image') {
            return edit(tileIndex, body)
        }
        return response(404, {code: 'NOT_FOUND'})
    } catch (error) {
        console.error(JSON.stringify({event: 'claims_api_failed', tileIndex, error}))
        return response(503, {code: 'CLAIMS_SERVICE_UNAVAILABLE'})
    }
}
