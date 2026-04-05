const Docker = require('dockerode');
const axios = require('axios');
const docker = new Docker(); // Connects to Docker on your Ubuntu/WSL2 system

class WorkerManager {
    constructor() {
        this.workers = new Map(); // Stores workerId -> metadata
        this.workerImage = process.env.WORKER_IMAGE || 'marketvision-worker:latest';
    }

    /**
     * Spawns a new Docker container for a worker
     * @param {string} workerId Unique identifier for the worker
     */
    async spawnWorker(workerId) {
        try {
            console.log(`Spawning worker: ${workerId}...`);
            const container = await docker.createContainer({
                Image: this.workerImage,
                name: workerId,
                Env: [
                    `WORKER_ID=${workerId}`,
                    `KAFKA_BROKER=${process.env.KAFKA_BROKER || 'localhost:9092'}`,
                    `PORT=3002`
                ],
                ExposedPorts: { '3002/tcp': {} },
                HostConfig: {
                    PortBindings: { '3002/tcp': [{ HostPort: '0' }] } // Auto-assigns host port
                }
            });

            await container.start();
            
            // Inspect the container to find the dynamically assigned port
            const inspectData = await container.inspect();
            const hostPort = inspectData.NetworkSettings.Ports['3002/tcp'][0].HostPort;

            const workerInfo = {
                id: workerId,
                containerId: container.id,
                port: hostPort,
                ip: 'localhost',
                status: 'running',
                startedAt: new Date().toISOString()
            };

            this.workers.set(workerId, workerInfo);
            console.log(`✅ Worker ${workerId} is live on port ${hostPort}`);
            return workerInfo;
        } catch (error) {
            console.error(`❌ Failed to spawn worker ${workerId}:`, error.message);
            return null;
        }
    }

    /**
     * Stops and removes a worker container
     * @param {string} workerId 
     */
    async killWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) {
            console.log(`Worker ${workerId} not found in registry.`);
            return false;
        }

        try {
            const container = docker.getContainer(worker.containerId);
            await container.stop();
            await container.remove();
            this.workers.delete(workerId);
            console.log(`🛑 Worker ${workerId} terminated.`);
            return true;
        } catch (error) {
            console.error(`❌ Failed to kill worker ${workerId}:`, error.message);
            return false;
        }
    }

    /**
     * Returns the list of all currently tracked workers
     */
    getAllWorkers() {
        return Array.from(this.workers.values());
    }
}

module.exports = new WorkerManager();