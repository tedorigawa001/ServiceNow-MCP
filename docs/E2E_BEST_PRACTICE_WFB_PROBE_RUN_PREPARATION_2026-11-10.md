# WF-B B-01：状態型・RunLink／duty先行準備・固定projectionの検証

Date: 2026-11-10 / 基準HEAD: `345e114` / 未コミット差分の合成検証。

対象は[(B)接続差分設計](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)のB-01だけ。正式発行口・C実行入口・実行閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。grant発行・新probe body起動・実接続・実通信・設定変更・Pushなし。作業開始時はクリーン。runtimeコード・設定は変更していない。

## 実装範囲・非実行境界

同compositionの新factory `createProbeRunPreparationFake`を追加。(A)の同root・同binding・同cell束・同startを利用し、4段階でorigin→RunLink→not_owed duty→非実行準備descriptorを生成・捕捉してから、同startへ一度結合する。旧37＋8段階とは別保持表で、49回の実allocation／workという意味ではない。部分失敗は元rootが捕捉prefix・拒否候補・借用を保持し、retry／rollbackで消さない。

内部型はuseとattempt flag、grantと参照有無、bodyとoutcome、exit acceptedなし、dutyと使用flagの有限契約を持つ。grantはprivate型定義のみで、issuer／constructor／active遷移を実装していない。pureな状態事実検査に21個の固定値scriptを用意するが、active／revoked等の値例を実cellへ書き込まず、検査返答もauthority=none／value_onlyである。

新入口のprepare／check／checkLegacy／checkState／close／inspectは固定値だけを返す。private cellのspread・serializeを使わず、grant・候補・RunLinkの参照をbooleanへ投影する。旧inspectをB-modeで呼ぶ経路は拒否する二重防御。旧(A)はgrantが空の旧表示を維持する。新snapshotのreadyは構築postの意味だけでexecution=closed。旧seed拒否は維持し、check／checkLegacyも同wrapperでbody前に拒否される。

## 最終実行結果

| 検証 | 結果 |
|---|---|
| 新probe-run-preparation試験 | 68件成功 |
| 関連20ファイル | 1,299件成功、失敗0 |
| 新compiled-probe-run-preparation | exit 0、下記mutation／semantic型拒否対照 |
| 旧compiled11本 | 全てexit 0 |
| `bdo npm run build` | exit 0 |
| composition＋新試験strict TypeScript | exit 0 |
| 梱包dry-run | exit 0、441ファイル、試験fixture混入0 |

関連試験はprobe-run-preparation／probe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundary。`bdo npx --no-install vitest run`へ各`tests/review/<name>.test.ts`を指定した。全repository回帰は未実施。

旧compiledはprobe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualの各`tests/review/fixtures/compiled-<name>.mjs`を`bdo node`で実行。旧対照は緩和せず、compositionの新factory export一覧だけ更新した。旧facadeのexportは不変。旧回帰試験の合成bodyは従来通り試験するが、新probeのbodyやruntimeを開いたことにはならない。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-run-preparation.test.ts`。梱包は一時cacheで`npm pack --dry-run --json --ignore-scripts`の一覧を検査し、tests全体／probe-run-preparation／composition fixtureの混入0を確認。archive生成・依存導入・配布worker起動は行っていない。

## 独立oracleとcompiled保証

4段階×before／attempt／after／doneの16prefixを、実装のstage表をimportせず添字と境界の意味から導出。既存37段階を保持したまま新prefixだけが進み、失敗後prepare／check／checkLegacy／closeが同じ固定返答を返すことを確認した。link9・duty8・準備descriptor5の不正field／copy、receiverだけのlink／duty copy、post失敗、構築中close、重複bind・構築再入、不正入力／Proxy／callback非実行も検査した。

状態値は6適合＋15不適合の独立期待表と照合。unused＋使用済み、entering＋未使用、active＋空／provisional、running＋revoked、acceptedあり、finished、未使用のsettled duty、body帰還済み＋空／provisional等を拒否する。実grantを生成せずbooleanの状態事実だけを扱う。この21例は全状態直積の網羅証明や実遷移の保証ではない。

新compiled対照はlink9・duty8・descriptor5・receiver2・重複bind1・状態guard3・projection3・spread/getter1。link/dutyの単独guard除去は、後段の冗長防御が拒否を維持する場合があるため、duty生成や次段階到達を測り、元の最初の拒否点が外れたことを確認する。receiverのcopy対照は実際にreadyへ進む差で確認した。predicateごとに一意な置換位置を検査し、別fieldの部分文字列を誤置換しない。

projection対照は隔離compileしたscratchだけで、既存のprivate frame originをgrant.current／exit.candidateへ不正に格納し、無関係なprivate metadata getterも置く。これはgrant brandを持たないinert sentinelで、grant発行ではない。正規projectionは保持booleanだけを返してgetterを実行しない。booleanを実参照へ置き換える3変異と、private cellのspreadへ戻すgetter実行変異を検出した。runtime／fixtureに登録口・friend・private参照exportは追加していない。public objectの固定key・深さ・data property・freeze・primitive終端も検査する。

semantic compile-failはTypeScript compiler hostのmemory内にだけ6つの不正代入を追加。unused＋使用済み、finished、returned＋none、active grant＋undefined参照、accepted object、not_owed duty＋使用済みを、それぞれ別行で拒否することを確認した。追加sourceはemit／import／実行せず、grantやbodyを生成しない。通常sourceの診断が0で、不正代入の6行だけに診断が出る条件を固定した。

## 初回失敗と修正

1. 初回strict検査は、意図的な故障script `duty_attempt`の不正組合せをFixedExitDutyへ直接castした1件を拒否した。通常mintの型を緩めず、この固定故障候補だけ明示的なunknown経由へ変更した。不正値はrootのfield検査で拒否され、正規参照へ昇格しない。局所3ファイル330件は当初から成功していた。
2. 状態表の追加対照で、exiting＋body帰還済みなのにgrantがempty／provisionalである2件を誤受理した（68件中2失敗、66成功）。exitingのbody／grant関係検査を追加し、同2件の拒否と適合exitingを確認した。再実行で新旧2ファイル133件成功、strictエラー0。その後の関連20ファイルは1,299件成功。
3. 新compiled初回は`link === issuedRunLink`の短いanchorがduty.link／descriptor.linkにも部分一致し、一意性assertで停止した。source判定を変えず、対象predicate内に絞って一意性検査を維持した。再実行で新compiled全対照が成功した。

期限・製品guard・旧試験の判定は緩めていない。これらを環境制約やruntime timeoutに分類していない。

## 未接続・Unknown

BE01〜06の利用claim消費・grant生成／捕捉／active・body開始、BX00〜04の固定exit guard／退役処理、accepted退出記録・finished、request／close実合流・回収claim・drain、実writer・Journal・packet・root終端は未実装。新slotはunused／empty／not_started／not_owedのまま。(B)の固定結果診断と、先行firstがあっても正規exitを継続する仕組みも、まだ実遷移へ接続していない。

型／状態表の成功を退出保証や実権限の退役証拠にしない。start側runMatchesのstable関係再検査のうち、単独対照はcurrent／issuedのlink・duty copyだけ。他はroot preflight／旧probe bindingに遮られる二重防御で、個別runtime効果未実証である。B-modeの旧inspect拒否も通常経路から未到達。実OOM・allocation layout・全ref回収・unit係数・総guard／projection呼出し上界・実E／S・runtime停止はUnknown。全体受付は無効のまま。

## レビュー修正（2026-11-10）

レビュー基準HEAD: `0c9e99b`。修正前は全体326ファイル・16,546件成功。

指摘：状態関係判定`probeStateFactsValid()`の各条件を1つずつ外す変異19種のうち14種が生存した。上記「6適合＋15不適合の独立期待表」は、先に評価される別条件で拒否されるshape（例：`finished`はuse列挙とnot_owedの両方、`entering_unspent`はattempt条件）に偏り、条件別の感度は5条件分だけだった。

修正：
- 適合基点（entering／active／exiting／unconfirmed）から1事実だけを変えた単独不適合shapeを13種追加した。`unconfirmed_finished`、`active_no_reference`、`active_unresolved`、`returned_cancel`、`exiting_exit_unknown`、`active_duty_used`、`entering_active_grant`、`active_body_unconfirmed`、`active_unsealed`、`exiting_running`、`exiting_attempting`、`exiting_owed`、`unconfirmed_settled`。基点は固定の値表から生成し、本体の判定式を使わない。
- compiledの状態対照を3→16種へ増やした。各条件を外すと対応shapeが受理へ変わることを確認する。
- `duty === 'not_owed'`の一律拒否は、各到達分岐がowed以降のdutyを要求するため等価と明記した。

RED：追加13件が修正前に失敗した（selector未登録）。compiledも失敗した。GREEN：新規81件成功、compiled 16状態対照を全検出。

一時変異（試験後に元へ戻した）：計19種、検出18、等価1（not_owed一律拒否）。

全体回帰：`npm run lint`・`npm run build`・`package-http-classification.mjs`成功、vitest全体326ファイル・16,559件成功。

## コミット候補だけの隔離再確認

同日、HEAD＋今回の9ファイルだけを一時index／object領域でtree化し、別directoryへ展開した。検証対象treeは`bbfa9c666854c45de8166d9deb7612c1a5973daa`（本節追記前）。既存node_modulesだけを参照し、依存導入は行っていない。このコピーでbuild・strict検査・関連20ファイル1,299件・新旧compiled12本（型拒否6件を含む）・梱包dry-runを再実行し、全てexit 0。梱包441ファイル、fixture混入0を再確認した。

本節以外のコミット対象が検証treeと同一であること、対象9ファイル・文書参照・差分空白をコミット前に照合する。今回もgrant発行・新probe body起動・実接続・実通信・設定変更・Pushは行っていない。全repository回帰は未実施。
