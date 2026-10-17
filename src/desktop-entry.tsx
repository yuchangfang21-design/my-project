import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
if(!window.xumu)throw new Error('无法加载桌面连接，请重新安装或启动应用。');
createRoot(document.getElementById('root')!).render(<App desktopApi={window.xumu} />);
