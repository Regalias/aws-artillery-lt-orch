#!/bin/bash -xe
export AWS_REGION=$1
export TAG_NAME=$2
export TAG_VALUE=$3
envsubst < /home/ec2-user/ansible/aws_ec2.yaml.template > /home/ec2-user/ansible/aws_ec2.yaml