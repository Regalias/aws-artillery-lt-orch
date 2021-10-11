import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as autoscaling from '@aws-cdk/aws-autoscaling';
import * as iam from '@aws-cdk/aws-iam';

export class AwsArtilleryLtOrchStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    const tagName = "role";
    const tagValue = "artilleryNode";

    // Stack parameters
    const instanceTypeParamString = new cdk.CfnParameter(this, "instanceType", {
      type: "String",
      description: "Instance size of artillery nodes",
      default: "c5.large"
    });

    const instanceTypeParam = new ec2.InstanceType(instanceTypeParamString.valueAsString);

    // Stack parameters
    const artilleryNodeCount = new cdk.CfnParameter(this, "artilleryNodeCount", {
      type: "Number",
      description: "Nubmer of artillery nodes",
      default: "0",
      maxValue: 20,
      minValue: 0
    });

    // Vars
    const artilleryDockerImage = new cdk.CfnParameter(this, "artilleryDockerImage", {
      type: "String",
      description: "Artillery Docker image to use",
      // https://hub.docker.com/r/artilleryio/artillery
      default: "artilleryio/artillery"
    });

    const keypairName = new cdk.CfnParameter(this, "keypairName", {
      type: "String",
      description: "SSH Keypair name from bootstrap",
      default: "ansible-orch-key"
    });


    // Stack resources
    const vpc = new ec2.Vpc(this, "vpc", {
      cidr: "10.0.0.0/16",
      subnetConfiguration: [
        {
          name: "public",
          cidrMask: 24,
          subnetType: ec2.SubnetType.PUBLIC,
        }
      ],
    });

    const amznLinux = new ec2.AmazonLinuxImage({
      generation: ec2.AmazonLinuxGeneration.AMAZON_LINUX_2,
      edition: ec2.AmazonLinuxEdition.STANDARD,
      virtualization: ec2.AmazonLinuxVirt.HVM,
      storage: ec2.AmazonLinuxStorage.GENERAL_PURPOSE,
    });

    const artilleryNodeAsg = new autoscaling.AutoScalingGroup(this, "ArtilleryNodeASG", {
      instanceType: instanceTypeParam,
      vpc: vpc,
      allowAllOutbound: true,
      machineImage: amznLinux,

      minCapacity: artilleryNodeCount.valueAsNumber,
      // desiredCapacity: artilleryNodeCount.valueAsNumber,
      // Omit desired capacity to not override ASG managed scaling
      maxCapacity: 20,

      groupMetrics: [autoscaling.GroupMetrics.all()],
      instanceMonitoring: autoscaling.Monitoring.BASIC,

      init: ec2.CloudFormationInit.fromElements(
        ec2.InitPackage.yum("docker"),
        ec2.InitService.enable("docker"),
        ec2.InitCommand.argvCommand(["systemctl", "start", "docker"]),
        ec2.InitCommand.argvCommand(["docker", "pull", artilleryDockerImage.valueAsString]),
        ec2.InitCommand.argvCommand(["usermod", "-aG", "docker", "ec2-user"]),
      ),
      signals: autoscaling.Signals.waitForAll({
        timeout: cdk.Duration.minutes(5)
      }),
      keyName: keypairName.valueAsString,
    });

    const artilleryControlAsg = new autoscaling.AutoScalingGroup(this, "ArtilleryControlASG", {
      instanceType: new ec2.InstanceType("t3a.medium"),
      vpc: vpc,
      machineImage: amznLinux,

      minCapacity: 1,
      // desiredCapacity: 1,
      // Omit desired capacity to not override ASG managed scaling
      maxCapacity: 1,

      instanceMonitoring: autoscaling.Monitoring.BASIC,

      init: ec2.CloudFormationInit.fromElements(
        ec2.InitCommand.argvCommand(["python3", "-m", "pip", "install", "wheel"]),
        ec2.InitCommand.argvCommand(["python3", "-m", "pip", "install", "boto3", "botocore", "ansible"]),
        ec2.InitSource.fromAsset("/home/ec2-user/ansible", "ansible/"),
        ec2.InitCommand.argvCommand(["ansible-galaxy", "collection", "install", "amazon.aws"]),
        ec2.InitCommand.argvCommand(["bash", "/home/ec2-user/ansible/bootstrap_ansible.sh", cdk.Aws.REGION, tagName, tagValue, keypairName.valueAsString]),
      ),

      signals: autoscaling.Signals.waitForAll({
        timeout: cdk.Duration.minutes(7)
      })

      // No root key here, use mssh
      // keyName: "",
    });

    // Allow control node to describe ec2 instances for ansible inventory
    artilleryControlAsg.role.addToPrincipalPolicy(new iam.PolicyStatement({
      resources: ["*"],
      actions: ["ec2:describeInstances"],
    }));

    // Allow control node to fetch SSM secure param for SSH key
    artilleryControlAsg.role.addToPrincipalPolicy(new iam.PolicyStatement({
      resources: [`arn:${this.partition}:ssm:${this.region}:${this.account}:parameter/${keypairName.valueAsString}`],
      actions: ["ssm:getParameter"],
    }));

    // Allow SSH to control node
    artilleryControlAsg.connections.allowFrom(ec2.Peer.ipv4("0.0.0.0/0"), ec2.Port.tcp(22));

    // Allow control node to talk to artillery nodes
    artilleryNodeAsg.connections.allowFrom(artilleryControlAsg, ec2.Port.allTraffic());

    // Add tags on artillery nodes for ansible inventory discovery
    cdk.Tags.of(artilleryNodeAsg).add(tagName, tagValue, {applyToLaunchedInstances: true});

  }
}
