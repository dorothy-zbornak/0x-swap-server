import argparse
from itertools import product
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

def bin_columns(rows, col, count=32, bins=None):
    if bins is None:
        min_v = min(r[col] for r in rows)
        max_v = max(r[col] for r in rows)
        bin_size = (max_v - min_v) / count
        bins = [min_v + bin_size * i for i in range(count + 1)]
    results = []
    for r in rows:
        v = r[col]
        for i, bin in enumerate(bins):
            prev_bin = bins[i - 1] if i > 0 else 0
            next_bin = bins[i + 1] if i < len(bins) - 1 else bin
            if v < prev_bin or v > next_bin:
                continue
            q1 = (v - bin) / (bin - prev_bin) if prev_bin != bin else 0
            q2 = (v - bin) / (next_bin - bin) if next_bin != bin else 0
            if abs(q1) <= 0.5 and abs(q2) <= 0.5:
                v = bin
                results.append({ **r, col: v })
                break
    for bin in bins:
        n = sum(1 for r in results if r[col] == bin)
        print(f'{bin}: {n}')
    return results

def aggregate_rfqt_presence(rows):
    results = []
    for gas_price, fee in product(set(r['gasPrice'] for r in rows), set(r['fee'] for r in rows)):
        relevant_rows = [r for r in rows if r['gasPrice'] == gas_price and r['fee'] == fee]
        count = sum(1 for r in relevant_rows if r['share'] > 0)
        if len(relevant_rows) > 0:
            row = {
                'gasPrice': gas_price,
                'fee': fee,
                'inclusionRate': count / len(relevant_rows),
            }
            results.append(row)
    return results

ARGS = get_program_args()
rows = load_rows(ARGS.file)
rows = bin_columns(rows, 'fee')
# rows = bin_columns(rows, 'gasPrice', 5)
rows = bin_columns(rows, 'gasPrice', bins=[0,1,10,50,100,200])
swaps_count = len(rows)
rows = aggregate_rfqt_presence(rows)
sns.lineplot(
    data=pd.DataFrame([
            [
                r['gasPrice'],
                r['fee'],
                r['inclusionRate']
            ] for r in rows
        ],
        columns=['gas price', 'fee', 'inclusion rate'],
    ),
    x='fee',
    y='inclusion rate',
    hue='gas price',
    palette='Paired',
    ci=68
)
for t in plt.gca().get_legend().texts[1:]:
    t.set_text(str(int(float(t.get_text()))))
plt.yticks(plt.yticks()[0][1:-1], [f'{int(100 * y)}%' for y in plt.yticks()[0][1:-1]])
plt.xticks(plt.xticks()[0][1:-1], [f'{int(x / 1e3)}K' for x in plt.xticks()[0][1:-1]])
plt.ylabel('RFQT inclusion rate across quotes');
plt.xlabel('RFQT order gas + fee')
plt.title(f'RFQT inclusion rate ({swaps_count} quotes)')
plt.show()
