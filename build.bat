@echo off
chcp 65001 >nul
echo ========================================
echo   OpenRouter AI Agent - 快速构建脚本
echo ========================================
echo.

echo [1/3] 检查 Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未找到 Node.js
    echo.
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 已安装
echo.

echo [2/3] 运行构建...
node build.js
if errorlevel 1 (
    echo.
    echo ❌ 构建失败
    pause
    exit /b 1
)
echo.

echo [3/3] 复制文件到根目录...
copy dist\agent.user.js agent.user.js >nul
echo ✅ 文件已复制到 agent.user.js
echo.

echo ========================================
echo   ✨ 构建完成!
echo ========================================
echo.
echo 📄 输出文件: agent.user.js
echo 💡 提示: 将 agent.user.js 拖拽到浏览器即可安装
echo.
pause
