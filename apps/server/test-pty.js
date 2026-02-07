const pty = require('node-pty');
const os = require('os');

console.log('Platform:', os.platform());
console.log('Arch:', os.arch());
console.log('node-pty version:', require('node-pty/package.json').version);

const shell = process.env.SHELL || '/bin/bash';
console.log('Using shell:', shell);

try {
    const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME,
        env: process.env
    });

    console.log('PTY created successfully with PID:', ptyProcess.pid);

    ptyProcess.onData((data) => {
        console.log('Output received:', data.slice(0, 100));
    });

    ptyProcess.write('echo "PTY works!"\r');

    setTimeout(() => {
        ptyProcess.kill();
        console.log('Test completed successfully!');
        process.exit(0);
    }, 2000);
} catch (error) {
    console.error('Failed to create PTY:', error);
    process.exit(1);
}
