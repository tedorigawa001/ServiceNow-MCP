# PD-A 二経路prefix・eligibility・境界oracleの合成検証

Date: 2026-11-03 / 基準HEAD: `6049b4c`。実PDI E2Eではない。
対象: [詳細契約§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PREFIX_DELTA_DESIGN.md)、[値helper](../tests/support/review/synthetic-prefix-delta.ts)、[合成試験／独立oracle](../tests/review/synthetic-prefix-delta.test.ts)、[梱包監査](../tests/review/package-http-classification.mjs)。

## 1 範囲と保証の限定

- 同caller DATAの親処理後prefixとverifyの値だけをbounded snapshotする。元順序とsort済みbaseの2経路で固定soft／verify delta、first-occurrence dedup、errors先頭100件、必要な切詰め警告を計算する。
- 親warningsの101〜103や重複は正規化前に拒否。stringsのUTF-16順・完全一致、error recordのfield有無／順序／重複、0.2／0.3 candidate-filterの局所条件を保持する。
- eligibilityはprefix-localのみ。P0／親trace／同owner、full header、実verify、同accepted projection、private binding・claim／guard・失効、全work／heapは未保証。値成功をseal／正式発行／全体受付へ昇格しない。
- helperはtests/supportだけ。runtime source・normal kernel・plan投影は変更しない。本文／実通信／実clock／実workerは使わない。結果のusageは入力copyの計数だけで、出力・算術費用を含む全体予算ではない。

## 2 テスト先行と負の対照

1. 最初の正常1試験はmodule未実装でcollectionがRED。helper追加後1件成功。
2. independent oracleはproduct helper／OM-A／plan projection／finalizeを呼ばず、線形既出リストと手動UTF-16比較の挿入順で期待値を作る。errorsは残枠を1件ずつ消費する。親oracleも残findings枠とresponse gateの別状態機械を使い、[99,2,1]等の手書きaction表で自身を確認した上で、実OM-Aをactualとして比較する。
3. 意図的にdedupをlast-occurrence方式へ変えた変異は、既出deltaを含むoracle試験1件が配列内容／順序の差を検出してRED。正しいfirst-occurrenceへ復元した。
4. errorsを先頭でなく末尾からsliceする変異は、局所の件数・flag試験だけでは一度成功した。一方、独立oracleの5 variantは全てRED（違うerrorが残る／100件を超える）となった。実装を復元し、局所試験にも最後に残るerror recordの完全比較を追加した。変異を製品／最終helperへ残していない。
5. 途中の65試験成功後、正規化済みverify errorの9 variantと広い不正構造のnode上限を追加した。未知codeは満杯errorsで落ちる予定でもstrict DATA境界で拒否する。legacy pure plan関数は変更していない。

作業中に親文書の本文リンクから版名を外す`6049b4c`が追加されていた。その変更を保持し、参照ラベルへ版名を戻していない。最終実行の未解消テスト失敗は0件。

## 3 確認条件

| 群 | 観測対象 |
| --- | --- |
| 原順序 | unsorted prefix、既出soft／verify／切詰め警告、32種類の既出組、同集合で順序だけ違う2入力 |
| Unicode | 大小文字・空白・合成／分解文字を変換せず、非BMPとBMPのUTF-16順を比較 |
| parent | keep→omit→keep、繰返し親省略、元worker省略先行／後行、重複初期警告、E=0/99/100。trace action／afterとprefixを独立oracleへ完全比較 |
| 境界 | raw 99〜104、親98/99/100＋3の101〜103、warning長200/201/2000/2001、重複の先行拒否、e=0/97/98/99/100とk=1/2/3・X有無 |
| errors | 既存同値errorの保持、optional sys_id、delta追加順・先頭部分・drop数、Xの位置／二重追加防止、X既存でも新dropなしならflag=false |
| verify | consistency／stage／必要warning集合／error順／no-verify整合を拒否。pure-only k=3やreordered warningの成功をcreator証拠にしない |
| strict/bounded | unknown／missing／版／stage／ID／field、errors101、疎配列／extra property／Symbol／cycle／深さ／keys／共有文字量・nodes、Proxy／accessor／toJSONを未実行で拒否 |
| 所有と非昇格 | 深いimmutable copy、callerは可変のまま、固定エラーとphase/reasonだけ、owner／issuer／claim／seal／body取得口なし |

P0の供給一致・実headerのcapture／比較・同pendingの一度限り結合・guard／取消／失効はPD-B以降の未接続条件であり、この75試験へ数え込まない。0.3削除行等の元asset条件も新helper入力ではなく既存model／normal経路の責務のまま。

## 4 検証結果

最終再実行はいずれも成功。上限・期限は変更していない。

- `bdo npx vitest run tests/review/synthetic-prefix-delta.test.ts`: **75件成功**。parameterized loop内の境界・順序全比較も含む。
- `bdo npx vitest run tests/review/synthetic*.test.ts`: **41ファイル3,395件成功**。全リポジトリ全件ではない。
- `bdo npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --skipLibCheck --target es2022 --module esnext --moduleResolution bundler tests/review/synthetic-prefix-delta.test.ts`: 新helper・oracleを含む厳密型検査に成功。
- `bdo npx eslint tests/support/review/synthetic-prefix-delta.ts tests/review/synthetic-prefix-delta.test.ts tests/review/package-http-classification.mjs`: エラー・警告とも0。
- `bdo npm run build`: 成功。製品srcのビルドであり、新helperの型保証とは区別する。
- offline `package-http-classification.mjs`: **441 files成功**。新helper・scope／model／brand／error markerの非同梱、固定pure import、seeded runtime／I/O／clock／worker／leak負の対照、compiled fixture群を確認。
- offline `package-worker.mjs`: **441 files成功**。製品依存限定install・compiled worker／MCP smoke・fixture非同梱を確認。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。private結合・移譲先seal成功・実接続・実通信・設定変更・Pushは行わない。

## 5 コミット候補だけの再検証

対象8ファイルだけをindexへ登録し、`git checkout-index`でHEAD＋その変更の一時コピーを生成した。既存node_modulesを参照し、distはコピー内で新規ビルドした。製品ビルド、合成recovery **41ファイル3,395件**、新helper／oracleのstrict／noUnused型検査、変更箇所ESLint、offline梱包監査・製品依存限定スモーク（ともに**441 files**）がすべて成功。元作業ツリーの未登録変更には依存せず、上限・期限緩和・実通信・設定変更・Pushは行っていない。
