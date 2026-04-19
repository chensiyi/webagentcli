// ==================== 高危代码确认对话框 ====================
// P0: 安全确认机制

(function() {
    'use strict';
    
    /**
     * CodeConfirmDialog 组件
     * @param {Object} props
     * @param {boolean} props.isOpen - 是否显示
     * @param {string} props.code - 待执行的代码
     * @param {string} props.riskType - 风险类型描述
     * @param {Function} props.onConfirm - 确认回调
     * @param {Function} props.onCancel - 取消回调
     */
    function CodeConfirmDialog({ isOpen, code, riskType, onConfirm, onCancel }) {
        if (!isOpen) return null;
        
        return React.createElement('div', {
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 999999
            }
        }, [
            React.createElement('div', {
                key: 'dialog',
                style: {
                    background: 'white',
                    borderRadius: '8px',
                    padding: '24px',
                    maxWidth: '600px',
                    width: '90%',
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
                }
            }, [
                // 标题
                React.createElement('h3', {
                    key: 'title',
                    style: {
                        margin: '0 0 16px 0',
                        color: '#dc3545',
                        fontSize: '18px'
                    }
                }, '⚠️ 高危代码警告'),
                
                // 风险类型
                React.createElement('div', {
                    key: 'risk',
                    style: {
                        padding: '12px',
                        background: '#fff3cd',
                        borderLeft: '4px solid #ffc107',
                        marginBottom: '16px',
                        borderRadius: '4px'
                    }
                }, [
                    React.createElement('strong', { key: 'label' }, '检测到风险：'),
                    React.createElement('span', { key: 'type' }, riskType)
                ]),
                
                // 代码预览
                React.createElement('div', {
                    key: 'code-label',
                    style: {
                        marginBottom: '8px',
                        fontSize: '14px',
                        color: '#666'
                    }
                }, '即将执行的代码：'),
                
                React.createElement('pre', {
                    key: 'code',
                    style: {
                        background: '#f5f5f5',
                        padding: '12px',
                        borderRadius: '4px',
                        overflow: 'auto',
                        maxHeight: '200px',
                        fontSize: '13px',
                        lineHeight: '1.5',
                        border: '1px solid #ddd'
                    }
                }, code),
                
                // 警告说明
                React.createElement('p', {
                    key: 'warning',
                    style: {
                        margin: '16px 0',
                        fontSize: '14px',
                        color: '#666',
                        lineHeight: '1.6'
                    }
                }, '此代码可能修改页面、删除数据或执行危险操作。请仔细检查后确认是否继续执行。'),
                
                // 按钮组
                React.createElement('div', {
                    key: 'buttons',
                    style: {
                        display: 'flex',
                        gap: '12px',
                        justifyContent: 'flex-end',
                        marginTop: '20px'
                    }
                }, [
                    React.createElement('button', {
                        key: 'cancel',
                        onClick: onCancel,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#6c757d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px'
                        }
                    }, '取消'),
                    
                    React.createElement('button', {
                        key: 'confirm',
                        onClick: onConfirm,
                        style: {
                            padding: '10px 20px',
                            fontSize: '14px',
                            cursor: 'pointer',
                            background: '#dc3545',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px'
                        }
                    }, '确认执行')
                ])
            ])
        ]);
    }
    
    // 暴露到全局
    window.CodeConfirmDialog = CodeConfirmDialog;
    
})();
