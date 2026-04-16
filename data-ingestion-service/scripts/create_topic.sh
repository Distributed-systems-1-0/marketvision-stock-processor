#!/bin/bash

# Create main topic
docker exec -it kafka kafka-topics \
  --create \
  --topic raw_data_stream \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1

# Create dead letter queue topic
docker exec -it kafka kafka-topics \
  --create \
  --topic dead_letter_queue \
  --bootstrap-server localhost:9092 \
  --partitions 1 \
  --replication-factor 1

echo "Topics created successfully"

# List all topics
docker exec -it kafka kafka-topics --list --bootstrap-server localhost:9092
