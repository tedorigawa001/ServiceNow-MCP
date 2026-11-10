# WF-B B03-B：安定identity／履歴guard・同dutyの一度限りsettling

Date: 2026-11-10 / 基準HEAD: `dd9108b` / 未コミット差分の合成検証。

対象は[固定exit差分設計](BEST_PRACTICE_WFB_FIXED_EXIT_LOCAL_RETIREMENT_DESIGN.md)§13のB03-B。[親設計](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)と[B03-A検証・レビュー修正](E2E_BEST_PRACTICE_WFB_PROBE_EXIT_PREPARATION_2026-11-10.md)を維持する。開始時は作業ツリーがクリーン。正式発行口・body起動・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留。退役実操作・成功terminal・実接続・実通信・設定変更・Pushは行わない。

## 実装範囲

新createProbeExitGuardFakeは同既存root／start／RunLink／duty／先行5slotを使う。Aのimmutable controlを同一性anchorとして維持し、同controlと同canonical参照へ結合するprivate進行cellを1つ先行生成・捕捉して同startへbindする。旧Aのlive型をchecking／settlingへ広げず、旧入口にrunを追加しない。追加生成のbefore／retained／bound後の故障も元ownerへ保持する。

runは同start wrapperの明示的なprobe_guardから既存captureを最大1回呼び、その実帰還後に固定guardへ合流する。captureの固定失敗返答を消さずprivate保持し、元capture firstとguard firstを分離。実constructor直前flag・issuer/current/receiver-issued/rejected・同grant全fieldで履歴を分類し、予約件数やpublic診断文字列を根拠にしない。one-shot開始は同dutyのsettling／attemptUsed=true／guard-afterとuse=exitingを同期固定する点。進行cellのexitUsedはそのmirrorであり別の資格ではない。

| 分岐 | 同dutyと保持 |
|---|---|
| claim前拒否 | not_entered診断だけ。not_owed、退出試行0 |
| 正規未呼出し（予約後未呼出しも含む） | 退出試行1、settlingのまま保持。retirement not_requiredは未確定 |
| 正規known（issuer保持後のcapture故障も含む） | 同grant全関係を再照合、退出試行1、settlingのまま保持 |
| unknown／knownだが不正候補 | 同identity／履歴境界の確認後に退出試行1、未確認停止。unknownはunknown、不正既知はknownのまま全参照保持 |
| identity／body帰還境界自体が不正 | claim前に拒否。元canonical dutyと候補を保持し、不一致側のdutyを変更しない |

全run返答はok=false。settling_heldは途中保持でありterminal成功ではない。retirement not_attempted・BodyAbsence unobserved・terminal noneを維持する。check／checkLegacy／closeはrunnerにしない。旧body／catch／finally／request／回収／drainを呼ばず、正式証拠も発行しない。

## 最終検証結果

| 検証 | 結果 |
|---|---|
| 新probe-exit-guard試験 | 76件成功 |
| 関連23ファイル | 1,624件成功、失敗0 |
| 新compiled-probe-exit-guard | exit 0、identity17・late grant14・履歴境界9・呼出し境界／unknown／first／再入／非返却2／参照保持／二段projection2・body trap・型拒否5 |
| 旧compiled14本 | 全てexit 0 |
| composition＋新試験strict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（既存設定のsrc／tests） | exit 0、error 0・warning 374 |
| 梱包dry-run | exit 0、441ファイル、tests／新fixture／composition fixtureの混入0 |

関連試験はprobe-exit-guard／probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundaryの各`tests/review/<name>.test.ts`を`bdo npx --no-install vitest run`へ指定した。全repositoryのvitest回帰は今回未実施。

compiledは新fixtureに加え、probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualを`bdo node tests/review/fixtures/compiled-<name>.mjs`で実行。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-exit-guard.test.ts`。buildは`bdo npm run build`、lintは既存eslintのsrc／tests全体をJSONで集計した。

梱包は一時cache指定の`npm pack --dry-run --json --ignore-scripts`をbdo nodeから呼び、返されたファイル一覧を検査した。archive生成・公開は行わず、一時cacheをfinallyで除去。compiledもscratchだけへ変異を出力してfinallyで除去する。runtime配布コード・設定・製品／試験期限は変更していない。

## 独立期待値とcompiled対照

未呼出し・予約済み未呼出し・issuer保持後・unknown・claim前拒否・stopの9条件を、発行数／予約数／退出試行数／元first／分岐の独立表で比較した。known不正14種はknown／provisional／参照保持のまま未確認停止し、退役成功へ変換しない。identityの同値copy／brand17条件は退出試行前、body／帰還不正2条件もclaim前に拒否する。

正常captureを用いる10観測点（capture-before、return-after、identity/history/claim/branchのbefore/after）のfault期待値を本体からimportせず添字から計算した。claim-after以後だけ退出試行使用済み・canonical duty未確認、capture帰還以後だけgrant保持、先行first・最初の故障位置・全参照を保持する。10点の再入はrun_in_progressで追加発行／claimなし、10点のstopは新規開始と既存責務処理を区別する。同一runを複数回呼んでも同一固定結果で再実行せず、closeでも元結果を消さない。各分類の基本対照とこのfault系列は分けており、全分類×全故障点の直積を実施済みとはしない。

新compiledは安定identity17節を単独で外して拒否からsettlingへ変わることを確認した。grant14節はcapture後のscratch注入に限定し、先行capture guardやrejected slotが後段guardをmaskしないようにした（capture first=none、rejected未保持のままexit検査で拒否）。current／receiver-issued／private issuerの同値copy不一致と、brand／field数／全fieldを個別に検査する。

履歴境界の実帰還、body状態・outcome、capture非進行中、duty未消費、phase／boundary、use phase、accepted不在の9条件にも単独対照を置いた。scratchでのbody状態・accepted等の改変は不正内部値の故障注入であり、body呼出しや証拠発行ではない。残る参照再照合・回収claim・その他のexit空slot条件等を全て単独検証済みとはしない。

予約件数を実呼出しflagの代わりに用いる変異、unknownのknown昇格、capture firstでexitを短絡する変異、再入guard除去、canonical duty claimの非返却とmirror計数の不一致、元capture返答の保持漏れを検出した。正規duty claimと診断mirrorを独立に検査し、二重会計／第2資格としない。通常の重複防御はroot cache・private固定結果・routeUsedの多段構成で、routeUsedだけの独立感度を成功扱いしない。

private same-duty／capture返答をsnapshotへ実参照として入れる2変異は、外側の厳密boolean projectionでfalseへ隔離されることを確認した。さらに外側も生値へ変える対照では型不適合を検出する。全公開graphは有限plain data・freeze・primitive終端、symbol／getter／関数なしを検査。旧body開始前のscratch throw sentinelにも到達しない。型試験はsettled／held成功・不正phase／branch・ok=trueの5行をsemantic compile-failで拒否する。

新projectionはA全体の固定0計数を再利用せず、anchor部分と実進行を分離して発行数・予約数・退出試行・知識状態をprivate台帳から表示する。slot不在はnot_created、許可外はunconfirmed。任意artifact／Proxy／callbackはhook0で拒否し、旧A／B-02の状態不変も検査した。

## 初回の問題と訂正

初回strict・関連4ファイル318件は成功した。新compiledの初回はcellsの対照が等価な第2比較にmaskされて失敗した。s.cellsを2回同じ正規参照と比較する方式を、s.cellsとcanonical台帳の比較＋binding.cellsとcanonical台帳の整合検査へ整理し、同じ拒否条件を保ったまま対照の独立性を確保した。

その後、新compiledのframe anchorがb.cells.frameの末尾にも一致し、旧frame compiledのanchorが新guardのb.cells比較にも一致して停止した。新しい比較だけを同値の逆順へし、旧guard・旧compiledの期待値は緩めず再実行した。期限やruntime挙動を変えた修正ではない。

## 未接続・Unknown

B03-Cの同target利用禁止latch・局所退役・全post・not_required確定・成功terminal、BodyAbsence証拠、BE05／06、(C)候補・同期確定、request／drain、borrow退役／owner解放、Journal・root終端、実会計は未接続。進行cellの生成1回・退出試行≤1は構造上の枠だけで、実allocation／全guard費・実E／S・layout・OOM・全体work上界はUnknown。全体受付は無効。今回コミット・Pushは行わない。

設計書・親設計書・本記録のローカルリンク20件に欠落なし。差分空白エラーなし。src／package manifest／lockfile／lint設定に変更なし。

## コミット前の対象限定再検証（2026-11-10）

前節までの未コミット方針は実装時点の記録。本節はその後のコミット依頼に対する確認である。B03-B関連9ファイルだけを明示してindexへ登録し、indexを一時ディレクトリへ展開した。対象9ファイルの内容がindexと一致することを確認し、既存node_modulesだけを借用した検証用コピーでbuild・strict・関連23ファイル1,624件・compiled15本を再実行して全てexit 0。全体lintもerror 0／warning 374でexit 0、梱包dry-runは441ファイル・fixture混入0、3文書のローカルリンク20件に欠落なしだった。全repositoryのvitest回帰は今回も未実施。最終追記は本節のみで、実装／試験内容は再検証時から変更していない。他の作業差分・実接続・実通信・設定変更・Pushは含めない。
