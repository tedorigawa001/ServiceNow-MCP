# WF-B RP-A：raw byte入力境界・UTF-8・外側framingの合成検証

Date: 2026-11-06 / 実装基準HEAD: `baaf60d` / 実行Node: `v24.18.0` / コミット: `f28f0a2`。
対象: [raw parser契約§8](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md#8-rp-a実装境界計数と破棄)。

## 1 範囲と状態

`tests/review/fixtures/raw-json-boundary.ts`と`tests/review/raw-json-boundary.test.ts`を追加。RP-Aは19項目のlimit型、独立の抽象work／操作計数、byteのbrand／容量受付、一度のprivate copy、全UTF-8 prepass、quote／containerを追う外側framingだけを実装した。依存は`node:util.types`のみ。

APIは`inspectCheckpointBoundary`。成功でも`kind=non_executable_raw_boundary, syntax=unchecked`であり、検査済みJSON値・bytes・receipt・proofを返さない。colon／comma／literal／number・重複key・field／schema・値関係は未検査。`{not_json}`・重複key・旧v1文字列の殻が境界を通り得ることを負の対照として固定し、完成parserの成功へ昇格しない。RP-B／RP-Cが入るまで、malformed bodyについての最終診断優先順位も保証しない。

既存の値core・旧v1・Store／recorder・runtime・package／build設定は変更していない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。証拠発行・本文保存・実接続・実通信・実機操作・設定変更・再採取・保管操作・Pushは行っていない。今回のソース／MD編集は未承認の観測証拠保存とは区別する。

## 2 TDDの経過

小さい境界から順に試験を先行し、各REDを確認してから実装した。

1. byte cap不足はcopy前に拒否する試験：stubで1件RED→limit／work／intrinsic metadata受付を追加して1件成功。
2. offset viewの一度copyとhook非実行・参照retire：未実装のcopy計数が0で1件RED→捕捉setとfinally retireを追加して2件成功。
3. overlong UTF-8拒否・copy破棄：境界成功になって1件RED→UTF-8 prepassを追加して3件成功。
4. 複数frameを最初のroot閉鎖で拒否：未検査のため1件RED→有限stack／quote scannerとLF／EOF検査を追加して4件成功。
5. quote込みscratch枠：cap2で内容1byteのstringを通して1件RED→両quote分を含めた事前受付へ訂正して5件成功。
6. buffer／hook／UTF-8／framing／workの独立対照を追加して新規107件成功。型検査・Lintも成功。その後、stringカウンターも増分前の上限拒否へ整理し、8ファイル798件成功を確認した。実際のEOFでmultibyteが途切れる8対照も追加し、最終は新規115件、8ファイル806件成功。

上記REDは意図した未実装・境界不足の対照であり、最終の未解消失敗ではない。製品・試験の期限や設定を緩めていない。

## 3 対照と保証境界

| 分類 | 確認した結果 |
|---|---|
| limits | 全19項目の欠落／0／負／−0／NaN／Infinity／小数／string／unsafe値拒否。配賦和不整合とoverflowをinput／copy前に拒否。getter／Proxy設定はhook実行0で拒否 |
| copy前受付 | N、背後A、A+Nの等値成功／1不足拒否。大きいbackingの小viewをN byteだけの保持としない。copy attemptは不足時0 |
| native metadata／copy | 標準view／bufferのown constructor・length・byteLength・byteOffset・buffer・slice・set・iterator accessorを読まず、offset可視範囲だけを一度copy。getter実行0。species／from／caller sliceなし |
| 許可外input | Buffer／subclass／Uint16Array／DataView／fake typed prototype／独自prototype／null／string／iterable／revoked Proxy／SharedArrayBuffer／空／detached／resizableの固定長・tracking・範囲外viewをcopy前に拒否 |
| UTF-8 | 手書き17不正vector・実EOFの8途中切れ・256単一byteを、試験側のfatal TextDecoderと独立照合。overlong／surrogate／範囲外／途中切れをutf8段で拒否し、EOF probeも1unit計上。8つの有効multibyte境界はUTF-8を通り、parse段のASCII profileで拒否 |
| 外側framing | BOM／先頭・途中空白／制御／DEL／escape、root型、未閉鎖／quote、delimiter不整合、LF欠落・CRLF・複数LF・trailing data／frameを固定stage／reasonで拒否。文字列内の括弧をroot終端としない |
| depth／string | depth5成功／6拒否、declared小上限、string内容64／65byteとquote込みscratchの境界を確認。token／field／node／path上限の処理はまだ開始していない |
| work oracle | 最小殻`{}\n`は独立BigIntで100unit。100等値成功／99停止を確認。17段階の小さいworkで前段停止、copy前受付とcopy後retire・value予算転用0を確認。runtime予算の証拠ではない |
| 失敗時参照破棄 | input以前の拒否ではcopy0。UTF-8／profile／frame／work失敗と正常終了では、完了copyをfinallyで一度retire。返値はfreeze済みmetadataだけで、caller変更による返値変化・raw alias・秘密canary／例外／stackの持出しなし |
| 閉鎖境界 | 新core importはutilのみ、JSON.parse／TextDecoder／I/O／clock／値core呼出しなし。src-only build、packageのtests除外を試験内で静的確認。旧試験を維持 |

破棄はJS参照を外すことだけを意味し、caller bufferの破壊・メモリzero化・即時GC／RSS回収・OS cleanup確認ではない。native allocation／setの例外注入は未実施。captured intrinsicは当該module初期化時に信頼する標準環境が前提で、全engine／全版の保証はしていない。

## 4 実行結果

すべて既存のローカル依存で、各shell commandには`bdo`を付けた。

- `npx vitest run tests/review/raw-json-boundary.test.ts`：**115件成功**。
- `npx vitest run tests/review/raw-json-boundary.test.ts tests/review/snapshot-value.test.ts tests/review/fixed-recorder.test.ts tests/review/fixed-evidence-store.test.ts tests/review/store-recorder-binding.test.ts tests/review/store-recorder-persistence.test.ts tests/review/recorder-terminal.test.ts tests/review/recorder-continuous.test.ts`：**8ファイル、806件成功**。最新の値coreレビュー修正と既存Store／recorder／DT系を含む。
- `npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck tests/review/fixtures/raw-json-boundary.ts tests/review/raw-json-boundary.test.ts`：成功。
- `npx eslint tests/review/fixtures/raw-json-boundary.ts tests/review/raw-json-boundary.test.ts`：成功。
- `npm run build`：成功。

全体回帰・compiled worker起動・実pack／production installは未実施。静的な配布境界対照を実pack確認とは呼ばない。過去の成功数を今回の検証結果へ流用していない。

## 5 残課題

RP-BのJSON字句／構文・重複key・canonical numeric token・path件数・node／token課金、RP-Cの既存値coreとの一度の固定接続が残る。raw boundary成功を証拠へ変換する経路はない。

limit bootstrapのnative reflection、allocation／set・formatterの実heap／CPU時間、AST／core copyの同時保持上界、全parserのwork model、共有期限／取消owner、運用capはUnknown／未承認。encoder・private aggregate／capture／custody・本文保存への接続は行っていない。
