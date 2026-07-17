#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import {CollageGenerationStack} from '../lib/collage-generation-stack.js'

const app = new cdk.App()

new CollageGenerationStack(app, 'CollageGenerationStack', {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
})
