/** No runtime imports. Dedicated process only; never format or retain an exception/rejection reason. */
export function installR2LauncherFatalGuards(): {
  remember: (code: unknown) => void; fatal: () => never; priority: () => 71 | 73 | undefined;
} {
  let known: 70 | 71 | 73 = 70;
  const fatal = (): never => process.exit(known);
  process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
  return { fatal, priority: () => known === 70 ? undefined : known, remember: code => {
    if (code === 73) known = 73;
    else if (code === 71 && known !== 73) known = 71;
  } };
}
