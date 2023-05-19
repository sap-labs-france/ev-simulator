import ansiColors from 'ansi-colors';

export class WorkerUtils {
  public static defaultExitHandler = (code: number): void => {
    if (code !== 0) {
      console.error(ansiColors.red(`Worker stopped with exit code ${code}`));
    }
  };
}
