#!/bin/bash

# Consume messages from main topic
echo "Consuming from raw_data_stream (press Ctrl+C to stop)"
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server localhost:9092 \
  --topic raw_data_stream \
  --from-beginning
