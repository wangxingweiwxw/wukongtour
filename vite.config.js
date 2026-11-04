import {defineConfig} from 'vite';
export default defineConfig({base:'./',build:{outDir:'dist',rollupOptions:{input:{heritage:'index.html',legacy:'heritage.html'}}},server:{host:'127.0.0.1',port:5177,
 // Exported images/reports can be briefly locked by Windows while being saved.
 // They are served normally, but do not need to trigger live source reloads.
 watch:{ignored:['**/artifacts/**/*.png','**/artifacts/**/*.jpg','**/artifacts/**/*.json','**/artifacts/**/*-source.js','**/public/heritage-map*.png']}
}});
