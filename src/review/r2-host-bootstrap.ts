/** No runtime imports: install before dynamically loading the dedicated host. */
export function installR2FatalGuards(): void {
  // Deliberately accept no arguments: never inspect, format, retain or abort with the reason.
  const fatal = () => { process.exit(70); };
  process.on('uncaughtException', fatal);
  process.on('unhandledRejection', fatal);
}
