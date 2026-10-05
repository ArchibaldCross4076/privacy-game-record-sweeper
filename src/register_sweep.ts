import { infrai } from "./infrai_client.js";

const task = process.env.SWEEP_TASK_URL;
if (!task) throw new Error("SWEEP_TASK_URL is required");

const job = await infrai.cron.create({
  cron_expr: "15 * * * *",
  task
});

console.log(JSON.stringify({ job_id: job.job_id, schedule: "15 * * * *" }));
