#!/usr/bin/env bash
# Created by GuntherCloudSolutions
# Last updated: 2026-06-28
#
# One-shot deploy for the AWS-native CloseTheOffer stack.
# Prereqs: AWS CLI + AWS SAM CLI installed and `aws configure` done.
#          Bedrock model access enabled in the Console (one time).
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
APP="closetheoffer"
SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # repo root (the site files)
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/4  Deploy backend (Cognito + API + Bedrock + DynamoDB)"
# Optional Google login: export GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.
sam deploy \
  --region "$REGION" \
  --stack-name "${APP}-backend" \
  --template-file "$HERE/infrastructure/backend.yaml" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --parameter-overrides \
      AppName="$APP" \
      GoogleClientId="${GOOGLE_CLIENT_ID:-}" \
      GoogleClientSecret="${GOOGLE_CLIENT_SECRET:-}"

echo "==> backend outputs (paste these into frontend/aws-config.js):"
aws cloudformation describe-stacks --region "$REGION" --stack-name "${APP}-backend" \
  --query "Stacks[0].Outputs" --output table

echo "==> 2/4  Deploy hosting (S3 + CloudFront + routing function)"
aws cloudformation deploy \
  --region "$REGION" \
  --stack-name "${APP}-hosting" \
  --template-file "$HERE/infrastructure/hosting.yaml" \
  --parameter-overrides AppName="$APP"

BUCKET=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "${APP}-hosting" \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" --output text)
DIST=$(aws cloudformation describe-stacks --region "$REGION" --stack-name "${APP}-hosting" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" --output text)

echo "==> 3/4  Upload site to s3://$BUCKET"
# NOTE: make sure aws-config.js is filled in and copied into the site root first.
aws s3 sync "$SITE_DIR" "s3://$BUCKET" \
  --exclude ".git/*" --exclude "aws-native/*" --exclude ".idea/*" \
  --exclude "*.md" --exclude "deploy.sh"

echo "==> 4/4  Invalidate CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null

echo "Done. Site URL:"
aws cloudformation describe-stacks --region "$REGION" --stack-name "${APP}-hosting" \
  --query "Stacks[0].Outputs[?OutputKey=='SiteURL'].OutputValue" --output text
