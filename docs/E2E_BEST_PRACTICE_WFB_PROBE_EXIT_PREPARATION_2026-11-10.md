# WF-B B03-A：有限内部契約・先行slot・同duty private結合

Date: 2026-11-10 / 基準HEAD: `297570a` / 未コミット差分の合成検証。

対象は[固定exit差分設計](BEST_PRACTICE_WFB_FIXED_EXIT_LOCAL_RETIREMENT_DESIGN.md)§12のB03-Aだけ。開始時は作業ツリーがクリーン。[親のgrant／duty設計](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)と旧B-02の既知prefix分類を維持する。正式発行口・body起動・C実行入口閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持。退役実操作・terminal成功・実接続・実通信・設定変更・Pushは行わない。

## 実装範囲と閉鎖

新`createProbeExitPreparationFake`は同composition・同既存root／start／cell／RunLink／未使用dutyに、idle control／未試行retirement／未観測absence／空terminal／同参照bundleを先行準備する。5段階のcurrent／issued・全field照合後、同startへ最大1回bindしpostする。旧37＋8＋4段階は追加slot込みの費用上界に流用しない。failure fieldと固定返答はslot生成より前から保持する。

追加入口はprepare／check／checkLegacy／checkAxes／close／inspectだけ。checkは従来のseed拒否を通る閉鎖確認で、enterやexitの代替ではない。closeも旧request／回収claim／drainを呼ばない。新入口からgrant発行0、use未使用、duty not_owed／attempt未使用／phase none・boundary none、control idle、retirement not_attempted、absence unobserved、terminal none。settling・退役・成功terminal・body・accepted退出記録は生成しない。

有限phase/boundaryと三軸のstrict値型を定義し、実行slotの型を値型から分離した。純粋checkerは固定50shapeと10phase適合対照だけを扱い、値を採用しない。body未開始の確認と単なる未観測を分け、knownと退役成功を混同しない。仮想のheld値が適合しても返すのはvalid booleanだけで、権限はない。

## 最終検証結果

| 検証 | 結果 |
|---|---|
| 新probe-exit-preparation試験 | 188件成功 |
| 関連22ファイル | 1,547件成功、失敗0 |
| 新compiled-probe-exit-preparation | exit 0、slot44・receiver1・duplicate1・axis41・projection3・body/capture trap・型拒否14 |
| 旧compiled13本 | 全てexit 0 |
| composition＋新試験strict TypeScript | exit 0 |
| `bdo npm run build` | exit 0 |
| 対象TypeScript lint | exit 0 |
| 全体lint（既存設定のsrc／tests全体） | exit 0、error 0・warning 374 |
| 梱包dry-run | exit 0、441ファイル、tests／新fixture／composition fixtureの混入0 |

関連試験はprobe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundary。各`tests/review/<name>.test.ts`を`bdo npx --no-install vitest run`へ指定した。全repositoryのvitest回帰は今回未実施。

compiledは新fixtureに加え、probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualを`bdo node tests/review/fixtures/compiled-<name>.mjs`で実行。strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-exit-preparation.test.ts`。対象lintは`bdo npx --no-install eslint`に同じ2ファイルを指定した。

梱包は一時cacheを指定した`npm pack --dry-run --json --ignore-scripts`を`bdo node`の固定検査から呼び、ファイル一覧を確認した。archive生成・公開は行わず、一時cacheをfinallyで除去した。compiledもscratchだけへ変異を出力しfinallyで除去する。runtime配布コード・設定は変更していない。

## 独立prefix・値・compiled保証

5段階×before／attempt／after／done／check＋最終bind／postの27点を本体からimportせず列挙し、fault／stopの54条件でstage・保持数・issued保持・受領開始位置・元firstを独立計算した。先行失敗後のprepare／check／checkLegacy／closeは同一固定返答を返し、参照やprefixを消さない。27点の再入はconstruction_in_progressのまま追加生成・権限開始0。stopはこの構築境界だけであり、固定exit中のstop継続を実証していない。

slotの同値copy、brand、field数、全identity／初期値の44条件を段階ごとに拒否し、単独compiled変異で最初の拒否位置が変わることを確認。第5slotのlink／duty／startの3条件は、前段を外しても受領側がbind位置で拒否する二重防御であり、ready成功にはならない。残る条件は該当guard除去で次段へ進みreadyに到達する。receiver copyの単独guard対照と二重bindの一度限り対照も分離した。start側のその他の再照合節や、ready後checkの再照合全節まで単独証明したとはしない。

三軸は独立表で適合9・不適合41を比較し、41不適合の各狙い条件を外したcompiled対照でvalidへ変わることを検出した。最初の不正enum対照が別の関係条件に隠れないよう、phase／boundary不正では他方を非noneにし、knowledge不正ではcallStartedを整合させた。将来variantのsemantic適合例もメモリ内で検査し、不正phase／組合せ、knowledge、retirement、body、terminal、live slotへの成功variant混入の14行が型エラーとなることを確認した。値の適合とlive slot生成許可を区別する。

実際に保持するcontrol／bundle／duty-linkのboolean projectionを実参照へ戻す3変異を検出。全公開graphは固定plain data・freeze・primitive終端、symbol／getter／関数なしを検査する。故障注入でused／blocked／started／returned等を不正に変えたslotも、その値と参照を保持するため一部booleanはtrueになり得るが、ready=false・binding_mismatchであり実操作計数0とは別の候補診断である。terminalの不正accepted保持もacceptedRetainedだけで、exitAcceptedはfalse固定。

旧body開始直前のscratch throw sentinelと、capture入口のthrow sentinelの双方で、新prepare／check／checkLegacy／closeが到達しないことを確認した。実token・実session・任意callbackを使わず、入力Proxyのhook0・旧B-01/B-02の状態不変も確認。新slot／値から正式証拠・移譲先の成功やcleanup完了を生成するAPIは存在しない。

## 初回の問題と修正

初回strictは7件失敗。2件はObject.freezeしたbrandがbooleanへ広がったためtrue literalを明示した。5件はB03-A live slotのfalse固定型に対する`=== true`比較で、TypeScriptが到達不能と判定した。型を成功variantへ広げずBooleanによる値projectionへ修正した。

初回合成試験は4件失敗。used／blocked／started／returnedをtrueへする不正slotを意図的に保持しているのに、期待値が全てfalseだったためである。拒否phaseと実操作0の検査を維持し、故障値の保持を独立期待値へ反映した。成功扱いや候補の巻き戻しは行っていない。

新compiled初回はnot_requiredの変異anchorがcallStarted側にも一致したため停止。対象となる完全な部分式へ限定して修正した。旧compiledでは新receiverの`bundle.link === this.#runLink`が既存のグローバル変異anchorの部分文字列と衝突した。新しい同一性比較だけを同値の逆順へし、既存guard・旧compiled対照は緩めず再実行した。

初回全体lintは未使用の値型4件を検出した。値coreのfact型がそれらのkind unionを参照するよう接続し、抑制コメント・設定変更をせず修正した。lintのJSON診断取得の補助手順は既定出力枠で途中切れたため、十分な枠で再取得した。製品上限・試験期限の変更はない。

## 未接続・Unknown

B03-Bの固定exit identity／履歴供給・同dutyのsettling、一度限り退出試行、B03-Cの同target局所退役・terminal確定、body帰還のprivate事実、BE05／06、(C)候補・accepted同期確定、request／drain、Journal／root終端は未実装。live slotの準備成功をheld_not_startedや全writer停止へ読み替えない。

5段階は論理scheduleであり、空配列・field初期化・freeze等を含む実allocation数・work費用・実E／S・layout・OOM・全体work受付はUnknown／無効のまま。今回コミット・Pushは行わない。

設計書・親設計書・本記録のローカルリンク16件に欠落なし。差分空白エラーなし。src／package manifest／lockfile／lint設定に変更なし。

## コミット前の対象限定再検証（2026-11-10）

前節までの未コミット方針は実装時点の記録。本節はその後のコミット依頼に対する確認である。B03-A関連9ファイルだけを明示してindexへ登録し、indexを一時ディレクトリへ展開した。対象9ファイルの内容がindexと一致することを確認し、既存node_modulesだけを借用した検証用コピーでbuild・strict・関連22ファイル1,547件・compiled14本を再実行して全てexit 0。全体lintもerror 0／warning 374でexit 0、梱包dry-runは441ファイル・fixture混入0、3文書のローカルリンク16件に欠落なしだった。全repositoryのvitest回帰は今回も未実施。最終追記は本節のみで、実装／試験内容は再検証時から変更していない。他の作業差分・実接続・実通信・設定変更・Pushは含めない。
