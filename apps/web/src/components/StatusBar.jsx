import { GitBranch, AlertCircle, CheckCircle } from 'lucide-react';

function StatusBar() {
    return (
        <div className="status-bar">
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>main</span>
                </div>

                <div className="flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>0 Problems</span>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <span>Ln 1, Col 1</span>
                <span>Spaces: 2</span>
                <span>UTF-8</span>
                <span>JavaScript</span>
            </div>
        </div>
    );
}

export default StatusBar;
