import ReactDOM from 'react-dom/client';
import { App } from './App';
import { AppBoundary } from './AppBoundary';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<AppBoundary><App /></AppBoundary>);
