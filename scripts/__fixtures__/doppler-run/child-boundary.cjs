const args = process.argv.slice(2);

process.stdout.write(`CHILD_STARTED:${JSON.stringify(args)}\n`);
process.exitCode = 23;
