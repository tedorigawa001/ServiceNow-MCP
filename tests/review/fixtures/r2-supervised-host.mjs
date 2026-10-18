// Fixed synthetic OS peer, never imported by a production launcher. No network or credentials.
const mode = process.argv[2];
process.on('message', value => {
  if (value.type === 'run_grant') {
    if (mode === 'block') {
      process.send({ type: 'ready' });
      while (true) { /* Independent supervisor must remain responsive. */ }
    }
  }
});
process.send({ type: 'prepared' });
