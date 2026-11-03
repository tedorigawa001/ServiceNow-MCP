# PD-B(C)：関係値post受理・一度限り固定消費・全破棄の合成検証

Date: 2026-11-03 / 実装開始HEAD: `b3ceea7`／最終確認時HEAD: `a48a39f`。
Scope: [接続設計§10](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PENDING_PREFIX_BINDING_DESIGN.md)の(C)。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、外部返却・seal成功・実接続は行わない。

## 1 固定接続

post guardと既存taken検査・候補の同pending／token／model／header／budget／失効serial再確認後だけ、opaque marker付きのprivate `OrderedPrefixRelation`を受理する。暫定slotを外し、caller hook／awaitを挟まず引数なしの固定consumerへ進む。

consumerはrootの利用claimを先に消費し、relation／marker slotを外してからspent・同marker・busy／停止状態・各identity／serialと既存checkTakenを検査する。正常でも関係値を返さず、消費件数だけを保持して元の固定state abortへ戻る。clear／isClearedに新slotを含め、本文参照が残れば上位custodyへ移せない。

公開inspectの追加は受理／消費件数・利用開始bool・保持boolのみ。summaryは関係値の再生成元にならず、take／header consumeの既存claimも再armしない。旧(B)試験の正常終端期待を受理1／消費1へ更新し、pre／post停止時は0／0を維持した。

## 2 合成・compiled保証

| 検証 | 確認結果 |
| --- | --- |
| 通常合成経路 | post guard内では受理0／消費0。呼出し後は受理1／消費1で全保持slotなし、seal0・固定abort |
| 取消／期限／不一致／再入 | postに到達する以前の停止・work不一致では関係値を受理せず、旧診断とcustody移譲を維持 |
| 外部非公開 | rootにconsumePrefixRelation／relation／seal等の入口なし。inspectにprojectionReceipt／canonical_prefixなし |
| 上位custody | 正常固定abort後は全payload参照をclearして上位へ移譲可能。再実行しても消費件数は1 |

[compiled fixture](../tests/review/fixtures/compiled-prefix-relation.mjs)はTypeScript strict診断0を確認して実kernel／依存と既存DATA fixtureを一時ESM treeへemitし、Nodeで直接実行する。製品srcのbuildだけを新経路のcompiled保証とみなしていない。実通信を防ぐfetch拒否を置き、一時出力はfinallyで除去する。

以下の**10経路**をcompiled graphで確認した。

1. 通常経路1件：受理1／消費1、固定state abort、全破棄と再実行拒否。
2. pre／post × 取消／期限の4件：受理0／消費0、全破棄と停止理由保持。
3. 一時出力コピーの4 fault：消費後に元slot／markerを復元して再消費、marker差替え、失効serial変更、受理直後の取消。各々bindingまたはcancelledで停止し、消費は最大1・全破棄。
4. 参照保持の負の対照1件：一時出力だけでrelation clearを除き受理直後に取消。relation保持を検出し、本文破棄証拠／custody移譲を拒否する。

fault注入は固定文字列を一時emitコピーへ適用する試験器材だけであり、ソースの通常実行には存在しない。private試験用friend・登録口・外部引数を追加していない。guard外で状態をassertし、throwしたことだけを成功条件にしない。fake参照の試験であり、OSの実workerやtransport解放を確認した保証ではない。

## 3 初回失敗

compiled試験の初回は、既存`bp5-results`が相対参照する`examples/bp2-review-result.json`が一時emit treeにないためENOENTで停止した。kernelの関係値処理へ入る前のfixture準備不足である。

デバッグ手順で既存fixtureのreadFileSync先を確認し、node_modulesと同様に既存examplesへの参照を一時treeへ供給した。新たな外部取得・設定変更・期限緩和は行っていない。再実行で全10経路が成功し、梱包監査からの連続実行でも成功した。

## 4 最終結果

- `bdo npm run build`：成功。
- `bdo npx tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck tests/review/synthetic-pending-prefix-transfer.test.ts`：成功。
- `bdo npx vitest run tests/review/synthetic-*.test.ts`：**43ファイル・3,454件成功**。接続試験12件・既存transfer42件を含む。作業中に追加された既存の`a48a39f`の3件を保持したため、旧(B)記録3,450件に今回1件と既存追加3件が加わる。
- `bdo node tests/review/fixtures/compiled-prefix-relation.mjs`：成功。実graphのstrict compileと上記10経路。
- `bdo node tests/review/package-http-classification.mjs`：**成功、441ファイル**。新private markerの漏出負の対照・固定依存・配布除外と、新compiled fixtureを含む既存compiled試験を確認。
- `bdo git diff --check`：成功。

全機能の全体回帰は未実行。実接続・実通信・実機操作・設定変更・Pushは行っていない。

## 5 残課題

関係値を移譲先seal ownerへ渡す正常経路・atomic commit／terminal-only寿命、全work／heapと3round配賦は未設計／未接続の部分が残る。full header全項目・本文内容比較・実worker／runtime provenanceは今回のprefix関係値の保証外。参照clearは物理消去やOS cleanup確認ではなく、Unknownを確認済みへ昇格させない。
