#!/bin/bash -xe
export AWS_REGION=$1
export TAG_NAME=$2
export TAG_VALUE=$3

cat > /home/ec2-user/ansible/aws_ec2.yaml <<EOF 
plugin: aws_ec2
regions:
    - ${AWS_REGION}
filters:
    tag:${TAG_NAME}: "${TAG_VALUE}"
compose:
    ansible_host: private_ip_address
EOF

# envsubst < /home/ec2-user/ansible/aws_ec2.yaml.template > /home/ec2-user/ansible/aws_ec2.yaml

# Ensure SSH directory exists
mkdir -p /home/ec2-user/.ssh/

# Fetch keypair from SSM
KEYPAIR_NAME=$4
KEY_PATH="/home/ec2-user/.ssh/id_rsa"
aws ssm get-parameter --name $KEYPAIR_NAME --with-decryption --query 'Parameter.Value' --output text --region $AWS_REGION > $KEY_PATH
chown ec2-user:ec2-user $KEY_PATH
chmod 600 $KEY_PATH
