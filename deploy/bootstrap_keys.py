import boto3
import botocore.exceptions

KEYPAIR_NAME = "ansible-orch-key"

def main() -> int:

    sess = boto3.session.Session()

    print(f"Bootstrapping keypair name '{KEYPAIR_NAME}' in region '{sess.region_name}'")
    ec2 = sess.client("ec2")
    
    try:
        ec2.describe_key_pairs(KeyNames=[KEYPAIR_NAME]).get("KeyPairs")
        print("Keypair already exists, nothing to do.")
        return 0
    except botocore.exceptions.ClientError as err:
        if err.response['Error']['Code'] != 'InvalidKeyPair.NotFound':
            raise err

    # No key exists, generate one
    # Create key via EC2 call
    print("Creating keypair...")
    resp = ec2.create_key_pair(
        KeyName=KEYPAIR_NAME,
        KeyType="rsa",  # FYI: property requires latest version of boto3
        TagSpecifications=[
            {
                "ResourceType": "key-pair",
                "Tags": [
                    {
                        "Key": "app",
                        "Value": "ansible-lt-orchestration",
                    }
                ]
            }
        ]
    )

    keymat = resp.get("KeyMaterial")
    
    # Upload private key to SSM
    print("Pushing to SSM...")
    ssm = sess.client("ssm")
    ssm.put_parameter(
        Name=KEYPAIR_NAME,
        Description="Private keypair material for ansible-orch-key",
        Value=keymat,
        Type="SecureString",
        Tier="Standard",
        Tags=[{
            "Key": "app",
            "Value": "ansible-lt-orchestration",
        }]
    )
    print("Done")
    return 0

if __name__ == "__main__":
    exit(main())
