#!/bin/bash -xe
python3 bootstrap_keys.py
cd ../
cdk deploy --no-rollback --parameters artilleryNodeCount=1