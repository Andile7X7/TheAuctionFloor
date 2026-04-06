import { build } from 'vite';

async function runBuild() {
  try {
    await build({
      logLevel: 'info',
      build: {
        emptyOutDir: false
      }
    });
    console.log('BUILD SUCCESS');
  } catch (e) {
    console.log('BUILD ERROR CAUGHT');
    if (e.errors) {
      console.log(JSON.stringify(e.errors, null, 2));
    } else {
      console.log(e.message);
    }
  }
}

runBuild();
