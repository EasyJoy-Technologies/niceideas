import sharp from "sharp";

// Every process shares prod2's 2 vCPUs and ~1 GB of free memory with other services: no libvips
// operation cache (memory held between images) and one libvips thread per image. The worker
// raises the thread count for its single job at a time (src/server/worker/run-worker.ts).
sharp.cache(false);
sharp.concurrency(1);

export default sharp;
