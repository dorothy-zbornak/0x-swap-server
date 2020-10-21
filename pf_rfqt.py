import argparse
import json
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

def load_rows(filename):
    rows = []
    with open(filename) as f:
        for line in f:
            for i in line.strip().replace('}', '}\n').strip().split('\n'):
                r = json.loads(i.strip())
                r['pair'] = '/'.join([r['makerToken'], r['takerToken']])
                r['cost'] = r['gasPrice'] * r['fee']
                r['share'] = r['rfqtVolume'] / r['size']
                rows.append(r)
    return rows

def get_program_args():
    ap = argparse.ArgumentParser()
    ap.add_argument('file', type=str)
    return ap.parse_args()

def mean(stuff):
    count = 0
    total = 0
    for x in stuff:
        total += x
        cont += 1
    return x / total

def bin_columns(rows, col, count=32):
    min_v = min(r[col] for r in rows)
    max_v = max(r[col] for r in rows)
    bin_size = (max_v - min_v) / count
    bins = [(min_v + i * bin_size, min_v + (i + 1) * bin_size) for i in range(count)]
    results = []
    for r in rows:
        v = r[col]
        for lo, hi in reversed(bins):
            q = round((v - lo) / (hi - lo))
            if abs(q) <= 1:
                v = q * (hi - lo) + lo
                break
        results.append({ **r, col: v })
    for (lo, hi) in reversed(bins):
        n = sum(1 for r in rows if r[col] >= lo and r[col] < hi)
        print(f'{lo}-{hi}: {n}')
    return results

ARGS = get_program_args()
rows = load_rows(ARGS.file)
rows = bin_columns(rows, 'fee')
rows = bin_columns(rows, 'gasPrice', 5)
sns.lineplot(
    data=pd.DataFrame([
            [
                r['pair'],
                r['gasPrice'],
                r['fee'],
                r['cost'],
                r['share']
            ] for r in rows \
                # if r['pair'] == 'DAI/WETH' \
                 # if abs(r['gasPrice'] - 100) < 25
        ],
        columns=['pair', 'gas price', 'fee', 'cost', 'share'],
    ),
    x='fee',
    y='share',
    hue='gas price',
    palette='Paired',
    ci=68
)
for t in plt.gca().get_legend().texts[1:]:
    t.set_text(str(int(float(t.get_text()))))
plt.yticks(plt.yticks()[0][1:-1], [f'{int(100 * y)}%' for y in plt.yticks()[0][1:-1]])
plt.xticks(plt.xticks()[0][1:-1], [f'{int(x / 1e3)}K' for x in plt.xticks()[0][1:-1]])
plt.ylabel('share of quote');
plt.xlabel('RFQT order gas + fee')
plt.title(f'RFQT share of quote volume ({len(rows)} quotes)')
plt.show()
