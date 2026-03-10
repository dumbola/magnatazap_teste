import { SmartDispatcherService, DispatchState } from '../src/campaign/smart-dispatcher.service'; // Adjust path as needed
import { Logger } from '@nestjs/common';
import { Instance } from '@prisma/client';

async function runSimulation() {
    console.log("Starting Smart Dispatcher Simulation...");

    const dispatcher = new SmartDispatcherService();

    // Mock Instances
    const mockInstances: Instance[] = Array.from({ length: 10 }).map((_, i) => ({
        id: `inst-${i}`,
        sessionId: `session-${i}`,
        name: `Instance ${i + 1}`,
        status: 'CONNECTED',
        proxyConfig: i === 5 ? '192.168.1.1:8000' : (i === 6 ? '192.168.1.1:8000' : `10.0.0.${i}:80`), // Duplicate IP for 5 & 6
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        warmupNumbers: [],
        campaigns: []
    }));

    const campaignId = 'camp-123';

    // 1. Initialize
    const allocated = dispatcher.initialize(campaignId, mockInstances);
    console.log(`Initialized: Allocating ${allocated.length} instances.`);
    console.log(`(Should be 9, dropping one duplicate IP)`);

    // 2. Simulate Loop
    console.log("\n--- Starting Sending Loop ---");

    for (let i = 0; i < 20; i++) {
        const slot = dispatcher.getNextSlot(campaignId);

        // Visualizing time
        const delaySec = Math.round(slot.delayMs / 1000);
        console.log(`[Step ${i + 1}] Selected: ${slot.instanceId || 'NONE'} | Waiting: ${delaySec}s`);

        if (i === 5) {
            console.log("!!! SIMULATING FAILURE on session-0 !!!");
            dispatcher.reportFailure(campaignId, 'session-0');
        }
    }
}

runSimulation();
