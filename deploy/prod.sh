#!/bin/bash -xe
python3 bootstrap_keys.py
cd ../
cdk deploy --parameters artilleryNodeCount=5
