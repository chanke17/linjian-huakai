#!/bin/bash
# 把 js/ 里的模块打包进单个 HTML（林间花开.html），可以直接双击用浏览器打开
set -e
cd "$(dirname "$0")"
npx -y esbuild@0.24.0 js/main.js --bundle --format=esm --external:three --external:'three/addons/*' --minify-syntax --outfile=.bundle.js
python3 - <<'EOF'
html = open('index.html', encoding='utf-8').read()
js = open('.bundle.js', encoding='utf-8').read().replace('</script', '<\\/script')
tag = '<script type="module" src="./js/main.js"></script>'
assert tag in html
open('林间花开.html', 'w', encoding='utf-8').write(html.replace(tag, '<script type="module">\n' + js + '\n</script>'))
EOF
rm .bundle.js
echo "已生成 林间花开.html"
