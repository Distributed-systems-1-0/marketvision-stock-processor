// src/services/workerManagerService.js
const Docker = require('dockerode');
const axios = require('axios'); 
const docker = new Docker();

class WorkerManager {
    constructor() {
        this.workers = new Map(); // workerId -> { container, info }
        this.workerImage = process.env.WORKER_IMAGE || 'marketvision-worker:latest';
    }

    async spawnWorker(workerId) {
        try {
            const container = await docker.createContainer({
                Image: this.workerImage,
                name: workerId,
                Env: [
                    `WORKER_ID=${workerId}`,
                    `KAFKA_BROKER=${process.env.KAFKA_BROKER}`,
                    `PORT=3002`
                ],
                ExposedPorts: { '3002/tcp': {} },
                HostConfig: {
                    PortBindings: { '3002/tcp': [{ HostPort: '0' }] } // Auto-assigns a free port
                }
            });

            await container.start();

            const inspectData = await container.inspect();
            const hostPort = inspectData.NetworkSettings.Ports['3002/tcp'][0].HostPort;

            const workerInfo = {
                id: workerId,
                containerId: container.id,
                port: hostPort,
                ip: 'localhost',
                startedAt: new Date().toISOString(),
                status: 'running'
            };

            this.workers.set(workerId, workerInfo);
            console.log(`✅ Worker ${workerId} spawned on port ${hostPort}`);
            return workerInfo;
        } catch (error) {
            console.error(`Failed to spawn worker ${workerId}:`, error.message);
            return null;
        }
    }

    async killWorker(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) return false;

        try {
            const container = docker.getContainer(worker.containerId);
            await container.stop();
            await container.remove();
            this.workers.delete(workerId);
            console.log(`✅ Worker ${workerId} killed`);
            return true;
        } catch (error) {
            console.error(`Failed to kill worker ${workerId}:`, error.message);
            return false;
        }
    }

    async getWorkerHealth(workerId) {
        const worker = this.workers.get(workerId);
        if (!worker) return null;

        try {
            const response = await axios.get(`http://${worker.ip}:${worker.port}/health`, {
                timeout: 2000
            });
            return response.data;
        } catch (error) {
            return { status: 'unhealthy', error: error.message };
        }
    }

    getAllWorkers() {
        return Array.from(this.workers.values());
    }
}

module.exports = new WorkerManager();