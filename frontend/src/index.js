import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { Provider } from "react-redux";
import store from "./store/store";


const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    
      <Provider store={store}>
    <App />
    </Provider>
  
  </React.StrictMode>
);

// Keeps the till running through a broadband drop: the service worker serves
// the app shell from cache, and the POS queues sales in IndexedDB until the
// connection is back. Only registered for a production build — in development
// a cached shell just gets in the way of hot reload.
if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    // Not fatal: if registration fails, the app simply loses its offline shell.
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

// Performance results can be sent to an analytics endpoint when configured.
reportWebVitals();
