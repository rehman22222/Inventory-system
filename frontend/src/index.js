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
    navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      // Not fatal: the app simply loses its offline shell.
      console.warn("Service worker registration failed:", error.message);
    });
  });
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
