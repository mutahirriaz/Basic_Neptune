import * as cdk from '@aws-cdk/core';
import * as ec2 from '@aws-cdk/aws-ec2';
import * as lambda from '@aws-cdk/aws-lambda';
import * as apigw from '@aws-cdk/aws-apigateway';
import * as neptune from '@aws-cdk/aws-neptune';

export class NeptuneLambdaStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    const vpc = new ec2.Vpc(this, 'Vpc', {
      subnetConfiguration: [
        {
          cidrMask: 24, // Creates a size /24 IPv4 subnet (a range of 256 private IP addresses) in the VPC
          name: 'Ingress',
          subnetType: ec2.SubnetType.ISOLATED
        }
      ]
    });

    // Create a security group and subnetgroup to ensure lambda and neptune cluster deploy on the same vpc
    const sg1 = new ec2.SecurityGroup(this, 'mySecurityGroup1', {
      vpc,
      allowAllOutbound: true,
      description: "security group 1",
      securityGroupName: "mySecurityGroup",
    });
    cdk.Tags.of(sg1).add("Name", "mySecurityGroup");

    sg1.addEgressRule(sg1, ec2.Port.tcp(8182), "MyRule");

    const neptuneSubnet = new neptune.CfnDBSubnetGroup(this, "neptuneSubnetGroup", {
      dbSubnetGroupDescription: "My Subnet",
      subnetIds: vpc.selectSubnets({subnetType: ec2.SubnetType.ISOLATED}).subnetIds,
      dbSubnetGroupName: "mysubnetgroup",
    });

    // creating neptune cluster
    const neptuneCluster = new neptune.CfnDBCluster(this, 'MyCluster', {
      dbSubnetGroupName: neptuneSubnet.dbSubnetGroupName,
      dbClusterIdentifier: 'myDbCluster',
      vpcSecurityGroupIds: [sg1.securityGroupId],
    });
    neptuneCluster.addDependsOn(neptuneSubnet);

    // creating neptune instance
    const neptuneInstance = new neptune.CfnDBInstance(this, 'MyInstance', {
      dbInstanceClass: 'db.t3.medium',
      dbClusterIdentifier: neptuneCluster.dbClusterIdentifier,
      availabilityZone: vpc.availabilityZones[0],
    });
    neptuneInstance.addDependsOn(neptuneCluster);

    // add this code after vpc code
    const handler = new lambda.Function(this, 'Lambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset('lambdas/lambda1'),
      handler: 'index.handler',
      vpc: vpc,
      securityGroups: [sg1],
      environment: {
        NEPTUNE_ENDPOINT: neptuneCluster.attrEndpoint
      },
      vpcSubnets: {
        subnetType: ec2.SubnetType.ISOLATED,
      }
    });

    new cdk.CfnOutput(this, "NeptuneEndpoint", {
      value: neptuneCluster.attrEndpoint,
    });

    const apigateway = new apigw.LambdaRestApi(this, "api", {
      handler: handler,
    });



  }
}
