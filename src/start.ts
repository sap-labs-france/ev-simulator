import Bootstrap from './charging-station/Bootstrap';
import ansiColors from 'ansi-colors';

Bootstrap.getInstance().start().catch(
  (error) => {
    console.error(ansiColors.red(error));
  }
);
