# WF-B RP-B：有限JSON字句／構文・構造上限の合成検証

Date: 2026-11-06 / 実装基準HEAD: `f28f0a2` / コミット: `6a8209a`。
対象: [raw parser詳細契約§9](BEST_PRACTICE_WFB_BOUNDED_RAW_JSON_PARSER_DESIGN.md#9-rp-b構文だけの閉鎖した固定継続)。

## 1 範囲と閉鎖状態

`tests/review/fixtures/raw-json-boundary.ts`に構文専用の`inspectCheckpointSyntax`を追加し、`tests/review/raw-json-syntax.test.ts`を追加。RP-Aのprivateな受付・一度copy・UTF-8を同じinvocationで継続し、有限stackでJSONを自前解析してからLF／EOFを確認する。旧`inspectCheckpointBoundary`の入口・model・既存試験は保持した。

成功でも`non_executable_json_syntax / syntax=checked / valueStatus=unchecked`と固定計数だけを返す。中間AST・bytes・scalar／key／path・caller callback・receipt／proofを返さず、正常・拒否・work中断とも同じ固定retireで参照を外す。文字列からprivate ownerや証拠を再構成しない。

値coreのschema版／field順／全field・enum／局所関係／encoded上界の受理は未接続で、syntax成功なら未知field・旧v1等も含み得る。`max_nodes`（core structural）や`max_live_value_nodes`の2V、value workの保証を確認済みにしない。全体受付無効・正式発行口閉鎖・Unknown・VM／監視／telemetry調査保留を維持した。

旧v1・既存値core・Store／recorder・runtime・package／build設定は変更していない。実接続・実通信・実機操作・設定変更・発行・本文保存・再採取・観測証拠保管・Pushは行っていない。今回のソース／文書編集は、未承認のraw観測証拠保存とは区別する。

## 2 TDDと初回失敗

1. colon欠落の拒否試験を先行。RP-Aへ委譲するstubで1件RED→有限状態object／array・字句を追加し、旧RP-Aと併せ116件成功。
2. 重複keyの後の値を故意に不正にし、value解析より先の拒否を要求。最初は`raw_syntax`かつ余分なnode予約で1件RED→現在objectの有界key比較を追加して成功。
3. 有効JSONだが`1.0`という非canonical数値を拒否する試験が1件RED→finite／非負／MAX_SAFE・往復token完全一致を追加して成功。
4. token／node枠の次操作拒否試験が1件RED→実計数を参照した受付を追加して成功。
5. 既知／未知pathの次array itemを不正にし、上限を先に拒否する試験が1件RED→固定path tagと全array capを追加して成功。ここまで旧RP-Aと120件成功。
6. 対照を拡充した初回は2ファイル219件中218成功、1件失敗。正常fixtureとした`1.2345678901234567e-7`が独立のNumber往復検査で`1.2345678901234566e-7`になった。systematic-debuggingに従い小さい読み取り専用実行で再現し、正常例を後者に訂正、前者を拒否対照へ追加した。parserの受理条件や期限は緩和していない。
7. 訂正後220件成功。独立110unit対照と手書き10 variantを追加し、最終は新規107件・旧系を含む9ファイル913件成功。

上記の意図したREDとfixture不一致は最終の未解消失敗ではない。過去の成功数を今回の結果へ流用していない。

## 3 独立対照と保証範囲

| 分類 | 確認した結果 |
|---|---|
| 有限構文 | colon／comma／literal／delimiter／EOF・hole・trailing comma・不正root・comment／regex等の拒否。parser再帰なしでdepth5を守り、上限を大きく指定しても6段目は拒否 |
| profile／framing | ASCII compact／escape禁止／単一LFを維持。UTF-8 prepassが最初、構文不正・重複がsuffix frame不正より優先。RP-Aのshell-onlyの診断をRP-Bへ流用しない |
| 重複key | rootと各nested objectで値／colon解析前に固定`raw_duplicate_key`。別objectの同名keyは合法。escape aliasはdecodeせずprofile拒否。`__proto__`等はnull-prototypeのown dataで、prototype汚染なし |
| 数値 | 23不正候補、8 canonical正常値、32／33byteと小scratch。−0・負・非finite・safe上限超過・underflow・precision差・別表記を拒否。33byteはnumeric変換費が0のまま停止。小数／MIN_VALUEは丸めずcanonical候補として構文成功 |
| 構造上限 | token／value node／AST nodeの等値・1不足、key／string64／65、field10／11、depth5／6。keyはtokenだがvalue nodeではないことを別oracleと照合 |
| path件数 | modules1000、cases20000、events20000、samples600、明示scopes10／workers20／scope_tails10の等値と次要素拒否。未知pathにもglobal array cap。似たsuffixだけでroot pathの特別枠を適用しない |
| 独立oracle | 手書き10 variantと正常golden、80個の有限生成treeを、parserから生成しないtree-count式で照合。V／T／field／item／container／depth／numeric数が一致し、T≤5Vを確認。JSON.parseは安全な正常fixtureのoracle補助だけで、拒否oracleには使わない |
| work | 空treeの110unitを別の費目和で照合し、等値／1不足を確認。代表treeの成功work未満すべての整数capで`raw_work`停止、value枠借入れ0、計上総和整合を確認（`retiredNodes`は`valueNodes`の写しで、参照解除そのものの観測ではない） |
| 破棄・非出力 | 同byteから一度copy、元view／bufferのown accessor／iterator実行0。正常／重複／構文／work失敗後、bytes・AST・生token・秘密canary・例外／stack・継続の返却0、frozen metadataだけを保持 |
| 閉鎖・旧保証 | importはutilのみ。値core／JSON.parse／TextDecoder／I/O／clock／issuer呼出しなし。旧RP-A115件と値core／Store／recorder系を併走。src-only／packageのtests除外を静的対照 |

valueNodes／tokensは成功時に正規の構造数と一致する。失敗prefixでは開始した予約を含み、retiredNodesはその予約を内部責務から退役させた数である。物理allocation数・GC／zero化・OS解放確認とは呼ばない。numeric-like keyの汎用JS object列挙順を元source順の証拠とせず、固定schemaへのfield順／未知field拒否はRP-Cへ残す。

## 4 最終実行

すべて既存ローカル依存で実行し、各shell commandには`bdo`を付けた。

- `npx vitest run tests/review/raw-json-syntax.test.ts`：**107件成功**。
- `npx vitest run tests/review/raw-json-syntax.test.ts tests/review/raw-json-boundary.test.ts tests/review/snapshot-value.test.ts tests/review/fixed-recorder.test.ts tests/review/fixed-evidence-store.test.ts tests/review/store-recorder-binding.test.ts tests/review/store-recorder-persistence.test.ts tests/review/recorder-terminal.test.ts tests/review/recorder-continuous.test.ts`：**9ファイル、913件成功**。
- `npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --target ES2022 --module ESNext --moduleResolution bundler --skipLibCheck tests/review/fixtures/raw-json-boundary.ts tests/review/raw-json-syntax.test.ts tests/review/raw-json-boundary.test.ts`：成功。
- `npx eslint tests/review/fixtures/raw-json-boundary.ts tests/review/raw-json-syntax.test.ts tests/review/raw-json-boundary.test.ts`：成功。
- `npm run build`：成功。

全体回帰・実pack／production install・compiled worker起動は未実施。静的な配布境界対照を実pack確認とは呼ばない。

## 5 レビュー修正（2026-11-06）

`6a8209a`のレビューで、実装の誤りは見つからなかった。テストの穴と記録の記述を修正した。上記の件数は修正前の値として残す。実装（`raw-json-boundary.ts`）は変更していない。

**レビューの確認（残さない一時プローブ）**

- `JSON.parse`と往復一致を使う独立オラクルとの差分ファジング：399,480件で受理／拒否の不一致0件。理由は比較していない。
- §5.1の対応表の33行とN=0：RP-B経路でstageと理由が一致。

**テストの修正**

- 理由の検査を固定した。`raw_syntax／raw_profile`や`raw_number／raw_syntax`のどちらでも通る緩い検査をやめ、stageと理由を1件ずつ指定した。
- 非空の木`{"ab":0.5,"ac":[1,"x"],"e":null}`を手で数えた312unitの対照を追加し、等値／1不足を確認した。従来は`{}`の110unitだけで、`tokenCopy`、`numeric`、`keyComparison`、`insertion`、`path`、`fields`、`items`の単位を検証できていなかった。
- 拒否対照を追加した：同じ長さの区切り違いとliteral違い、要素の後の閉じ括弧違い、閉じていない文字列、文字列内外のDEL、空文字列とscratch不足。
- 上限対照を追加した：scratchが66より大きいときの64／32 byteの上限、全既知pathでの小さい`max_array_items`、root以外の`scope_tails`と`scopes`、既知配列の子のunknown復帰。
- cap不足とbyte不正の優先順位を固定した（下記の§5の追記に対応）。

**文書の修正**

- RP-A・RP-Bの記録のリンクラベルから版を外し、「コミットは行っていない」を訂正した。
- 親契約§5へ優先順位を追記した。

**ミューテーション**

拒否の無効化、理由の入替え、課金の削除、手動変異の計198件を実施した。修正前は144件を検出し54件が生存した。修正後は177件を検出し、生存は次の21件である。

| 修正後も生存 | 件数 | 理由 |
|---|---:|---|
| 等価・冗長 | 11 | 数値文法の正規表現の緩和と無効化、`-0`・有限性・長さの検査は、後段の往復一致や範囲検査が同じ理由で拒否する。keyの開始quote検査（L168、理由入替えを含む）とL275は互いを補う。`proto-assign`はnull prototypeなので同じ結果。`key-after-value-dup`は文の順序を入れ替えただけで動作が同じ |
| 到達不能の防御 | 2 | rootの`raw_internal`検査（L295） |
| 故障注入なしでは到達不能 | 5 | copy例外（L317）と、hookが動かない経路のcopy後再確認（L319、`after-copy-skip`）。native故障注入は未実施 |
| 観測不能 | 3 | root／stack／owned参照の解除。参照の持出し口がなく、試験から観測できない |

| 修正後の実行 | 結果 |
|---|---|
| `tests/review/raw-json-syntax.test.ts` | 139件成功 |
| `tests/review/raw-json-boundary.test.ts` | 115件成功 |
| 全テスト | 298ファイル、14,783件成功、失敗0 |
| repo全体の`npm run lint` | エラー0、警告374 |
| `npm run build`、`node tests/review/package-http-classification.mjs` | 成功 |
| 変更ファイルの型検査、`git diff --check` | 成功 |

実pack・compiled worker起動・native故障注入は未実施のまま。

## 6 残課題

RP-Cの既存値coreへの一度だけの固定入力、AST／最終copyの2V事前受付、core structural計数上界と費目の結合・失敗理由保持を次へ残す。現在の中間ASTは外へ渡さず破棄するので、RP-Cのための公開consumer／friend／AST getterは追加していない。

full値の独立比較、formatter全binary64・native allocation例外、設定reflection／AST metadata／実heap・CPU時間、全parserの費目上界と共有予算／期限／取消、実source・encoder・private aggregate／capture／custody・Store接続と運用capは未確認／未承認。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。
