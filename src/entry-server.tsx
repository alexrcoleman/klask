import { renderToString } from 'react-dom/server';
import GameRoute from './routes/GameRoute';

export function renderShell() {
  return renderToString(<GameRoute />);
}
