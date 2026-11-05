# WF-B strict値core：合成検証記録

Date: 2026-11-06 / 実装基準HEAD: `70cbffb` / コミット: `b37214f` / 対象契約: [strict値契約](BEST_PRACTICE_WFB_SNAPSHOT_VALUE_CONTRACT.md)§9。

## 範囲と状態

合成専用の`tests/review/fixtures/snapshot-value-core.ts`と`tests/review/snapshot-value.test.ts`を追加。readonly内部値型・10 variant・件数／encoded上界・局所関係検査だけを実装した。成功値は入力と独立したfreeze済みDATA、shape、上界、内部work計数であり、発行証拠・receipt・保存権限ではない。

旧`wfb-checkpoint-1`・既存recorder／Storeのソース、全deadline、製品timeout、package／build設定は変更しない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。証拠発行・本文保存・実接続・実通信・実機操作・設定変更・再採取・証拠保管・Pushは行っていない。MDへの本記録の追記は、未承認の採取証拠保管とは区別する。

## RED・初回失敗と修正

1. 空shapeの計算を先に試験化し、未実装のRED後に最小のchecked上界計算を実装した。
2. 10 variantの正常値試験はstubにより1件RED（計算器は成功）。strict schema・copy／freezeを追加して2件成功。
3. 局所関係の18拒否対照を追加すると18件RED／3件成功。参照・集計・順序・時刻・coverageの検査を接続して21件成功。
4. 追加試験の初回は112行付近の余分な括弧により変換失敗、試験未実行。型検査でもTS1005／TS1128を確認。systematic-debuggingに従い同じ位置を特定して1箇所訂正した。
5. 再実行は105件中104件成功、独立BigInt対照1件が`schema`で失敗。入力shapeだけが`cases, modules, events, samples, scopes, workers`順だった。coreの固定順`cases, modules, events, scopes, workers, samples`にfixtureを合わせた。schemaを緩和していない。その後109件成功。
6. enum・型union・Metric幅・runtime境界対照を追加し、新規193件成功。最終の旧系併走は628件成功。

## 検査した対照

| 分類 | 結果と保証境界 |
|---|---|
| strict値型・10 variant | 型レベルのvariant key全一致、2 control＋4 captured＋4 unavailable、禁止snapshot／reason・未知／不足field・固定順・固定gatesを確認 |
| 全row・固定enum | Module／Case／Scope／Event／Worker／Sample／ScopeTail、全EventName／Phase／EventDetail／EventCode、case／module状態、coverage理由・snapshot理由・stop対応を確認。因果・実観測の真正性は未証明 |
| 局所関係 | case→module、scope→case、event／worker→scope、moduleの8状態件数、tail集合／last_seq、event局所連番・非減少時刻、source_event_ordinal=0矛盾、sample数／順序を確認 |
| 合法な途中観測 | 異scope eventの原順序、worker欠番、inactive scope末尾の複数null worker、未観測phase、同時刻sample、小数時刻、completed moduleのfailed caseを保持。補正・sort／dedup・番号補完なし |
| 不完全と矛盾 | inactive／unknown／不足metric／terminal duration欠落にはincomplete prefixを要求（inactive／unknownの単独確認はレビュー修正で追加）。prefix／first_reasonとrun completeの矛盾、明示failedとtest_terminal passedの矛盾を拒否 |
| unknown入力 | Proxyをreflection前に拒否。accessor／toJSON／外部iteratorを呼ばず、独自prototype／sparse／symbol／余分field／cycle／boxed number／NaN／Infinity／−0を拒否。caller mutationが受理copyに影響しない |
| 件数・上界 | shapeの0／契約上限／上限+1、scope局所4096 worker／event、実array長の早期上限、checked overflow、byte capの等値／1不足を確認（単体計算器の分はレビュー修正で追加）。BigIntの別計算で最大件数式とscope tail費を照合 |
| 独立幅対照 | 安全な合成fixtureに限り試験内で標準JSON.stringify＋LFの長さを測り、全10 variantと全rowが上界内であることを照合。別の固定child_started文字列をgoldenとし、Metricのvariant別幅からSample264を導出。製品encoderを実装したとは扱わない |
| workと拒否 | structural／relation／arithmetic／number_formatting／copiesの和、総work等値成功／1不足停止、structural cap、全limitsの明示正値、秘密を含まない固定拒否理由を確認 |
| 閉鎖境界 | core importは`node:util`だけ。新coreからclock／Store／recorder／runtimeへ依存なし。tsconfigはsrcのみ、package配布rootにtestsなし。実pack／インストール／配布物実行は未実施 |

## 最終実行

すべてローカルの既存依存で実施し、期限・capの製品値を変更していない。以下のshell実行は`bdo`を付けた。

- `npx vitest run tests/review/snapshot-value.test.ts`：**193件成功**。
- `npx vitest run tests/review/snapshot-value.test.ts tests/review/fixed-recorder.test.ts tests/review/fixed-evidence-store.test.ts tests/review/store-recorder-binding.test.ts tests/review/store-recorder-persistence.test.ts tests/review/recorder-terminal.test.ts tests/review/recorder-continuous.test.ts`：**7ファイル、628件成功**（最終実行）。旧v1・Store／recorder・DT系の合成回帰を含む。
- `npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck tests/review/fixtures/snapshot-value-core.ts tests/review/snapshot-value.test.ts`：成功。
- `npx eslint tests/review/fixtures/snapshot-value-core.ts tests/review/snapshot-value.test.ts`：成功。
- `npm run build`：成功。
- runtime／package設定への新core参照検索：該当なし。新試験内の配布境界対照：成功。

全体回帰・実pack・compiled worker実行は今回の純粋core保証に含めない。過去の全体成功数を今回の結果へ流用しない。

## レビュー修正（2026-11-06）

`b37214f`のレビューで、coreの不具合2件とテストの穴を修正した。上記の件数は修正前の値として残す。上界の式・定数は変更していない。

**coreの修正**

- 全配列が空のsnapshotで`run=complete`を受理していた。契約§6に従い拒否する。
- `test_result=passed`で、`not_run`caseのmodule／hook failureを受理していた。契約§4に従い拒否する。

**確定した判断**

`observed`以外のmetricは`not_supported`も含めてprefix incompleteとする。coreの動作を正とし、契約の「必須metric」をこの規則に揃えた。実samplerの接続時に見直す。

**テストの修正**

拒否テストが理由`relation`だけを確認しており、別の検査が先に失敗して狙いの検査に届かない場合があった。1つの規則だけを破るfixtureへ分け、次を追加した。

- local関係とprefix incompleteの単独拒否、`first_anomaly`のordinal規則と参照先、scope局所のworker 4097件
- 10 variantの上界の厳密値と、最大幅fixtureによる全rowの確認。`conditions_ready`、`child_started`、`stop_requested`の本文なし上界には実長が到達する
- 入れ子とMetricのProxy、全トラップ付きのroot Proxy、Array subclass、非列挙field／row、`time`の上限
- 積が収まる場合の加算overflow、単体計算器のbyte capと`workers`のscope局所上限
- 手で数えた`child_started`のwork内訳

**ミューテーション**

`check(...)`を1件ずつ無効化する自動変異と手動変異を実施した。修正前は105件中57件を検出し、48件が生存した。修正後は、追加分を含む109件中105件を検出した。

| 修正後も生存 | 理由 |
|---|---|
| `enumerable-peek` | 等価。`peek`の後に必ず`record`が同じ値を検査する |
| `accessor-ownData` | 等価。accessorの値は`undefined`になり、後段で必ず拒否される |
| `token-roundtrip` | 現行の数値表現では到達できない。全binary64入力の証明ではない |
| `mul-overflow` | 冗長。溢れた積は`add`の検査が拒否する |

| 修正後の実行 | 結果 |
|---|---|
| `tests/review/snapshot-value.test.ts` | 256件成功 |
| 全テスト | 296ファイル、14,529件成功、失敗0 |
| repo全体の`npm run lint` | エラー0、警告374 |
| `npm run build`、`node tests/review/package-http-classification.mjs` | 成功 |
| 変更ファイルの型検査、`git diff --check` | 成功 |

実pack／compiled worker実行・実保存・実通信は未実施のまま。

## 残課題

raw JSONのUTF-8・duplicate key・token／work parser、body encoder、実sourceの正規化、aggregate／cutoffの真正性、private capture・予算／custody結合、本文予約・保存・failure切替えは未接続。未知objectに対するnative reflectionの一時heap／実時間、intrinsic formatter全binary64入力の証明、統合work／scratchと運用capはUnknown／未承認。今回のworkは純粋core内の抽象計数で、OS操作数・実CPU時間・heapや全体受付を証明しない。
