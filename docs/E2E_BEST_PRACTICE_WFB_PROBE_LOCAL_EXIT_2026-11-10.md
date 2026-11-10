# WF-B B03-C：同target局所退役・全post・body未開始terminal

Date: 2026-11-10 / B03-B実装基準HEAD: `ff7e38b` / コミット前検証基準HEAD: `a1b7be6` / 未コミット差分の合成検証。

対象は[固定exit差分設計](BEST_PRACTICE_WFB_FIXED_EXIT_LOCAL_RETIREMENT_DESIGN.md)§14と[親設計](BEST_PRACTICE_WFB_PROBE_GRANT_EXIT_DUTY_DESIGN.md)。開始時の作業ツリーはクリーン。正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実session／worker／transport・実通信・実機・設定変更・Pushは行わない。今回コミットも行わない。

## 実装範囲と所有境界

新createProbeLocalExitFakeは既存root／start／RunLink／duty／B guardを使用する。Aの初期immutable slotを変更せず、同control／duty／guard／terminal anchorへ直接結合したlive retirement・absence・terminal・進行stateの先行4slotを生成する。同rootのcustodyであり別owner／予算／proofではない。bindは一度のみ、構築18点の故障では生成済みprefixと部分責務を保持しready前に止まる。

同start wrapperのcapture→実帰還→既存B guard→同duty settling→C局所処理の連続経路だけを追加する。旧A/Bの入口・試験は残し、B単独の終端settling_heldは変更しない。任意grant・body・callback・artifact登録口を作らない。check／checkLegacy／closeは新しいbodyや旧generationFrame／requestを起動しない。

knownの退役では同private issuerをtargetへ捕捉し、一度限りattempt→同targetの禁止latch→実grant.stage=revoked→全field／参照・禁止状態のpost→confirmedTarget保持とする。target候補・禁止対象・確認対象は独立した保持参照で、後続故障で候補が壊れても元対象の利用を再開しない。正規未呼出しはretirement attempt=0・not_required。unknown／known不正は未確認、not_enteredは試行なし。元capture firstと返答を保持したまま必要なexitへ進む。

同capture実帰還・capture非進行中・body not_started／outcome none・閉鎖routeを確認し、absenceを記録する。全postとcommit直前の再照合後、直接代入だけで同duty settled_not_started／use exiting／exit unsealed／private terminal held_not_startedを固定する。これはbody完了・wrapper inactive・accepted退出証拠・cleanup完了・root終端ではない。全返答ok=false、正式候補／issued／acceptedはundefined固定。

commit前の故障でも一度消費したattempt、禁止／確認対象、既知のrevoked／confirmed／not_required事実は払い戻さない。全体は未確認停止する。commit後の故障はdeliveryUnconfirmedとして分離し、確定済みterminal／dutyを巻き戻さない。再入はrun_in_progress、再run／closeは元固定返答で再処理しない。元slot・current／issued／rejected等は破棄しない。

## 検証結果

| 検証 | 結果 |
|---|---|
| 新probe-local-exit試験 | 113件成功 |
| 関連24ファイル | 1,737件成功、失敗0 |
| 新compiled-probe-local-exit | exit 0、同一性16・一度限りbinding・退役post6・実禁止latch・全post10・後段境界18・late grant再照合・線形化点／非巻戻し／同duty・確認保持／再実行拒否・二段projection3・構築stage許可値・body trap・型拒否6 |
| 旧compiled15本 | 全てexit 0 |
| composition＋新試験strict TypeScript | exit 0 |
| build | exit 0 |
| 全体lint（既存設定のsrc／tests） | exit 0、error 0・warning 374 |
| 梱包dry-run | exit 0、441ファイル、tests／新fixture／composition fixtureの混入0 |

関連試験は新probe-local-exitに、probe-exit-guard／probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／writer-gate／canonical-supply-construction／journal-supply-shell／absence-journal／canonical-supply-transfer／capture-admission／canonical-supply-view／pending-binding／pending-construction／read-hash-capacity／read-hash-declared-actual／read-hash-kernel-extraction／read-hash-fake／retirement-start／snapshot-read-start／snapshot-read-composition／supply-boundaryを加えた各`tests/review/<name>.test.ts`。`bdo npx --no-install vitest run`へ明示した。全repositoryのvitest回帰は未実施。

compiledは新fixtureと、probe-exit-guard／probe-exit-preparation／probe-grant-capture／probe-run-preparation／probe-frame-preparation／canonical-gate-draft／canonical-supply-construction／journal-supply-shell／writer-gate／absence-journal／capture-admission／retirement-start／pending-binding／pending-construction／declared-actualを`bdo node tests/review/fixtures/compiled-<name>.mjs`で実行。変異は一時scratchのみへ出力しfinallyで除去する。実body・ネットワークは呼ばない。

strictは`bdo npx --no-install tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/fixtures/snapshot-read-composition-fake.ts tests/review/probe-local-exit.test.ts`。buildは`bdo npm run build`、lintは既存eslintのsrc／tests全体をJSONで集計。梱包は一時cache指定の`npm pack --dry-run --json --ignore-scripts`の一覧検査で、archiveを生成／公開せずcacheをfinallyで除去する。src・manifest／lockfile・設定・製品／試験期限に変更なし。

## 独立期待値・compiledの感度と限界

knownの11phase×before／after=22点と未呼出しの8phase×2=16点は、本体からscheduleや期待値をimportせず、独立した配列と到達indexでattempt／block／revoked／confirm／absence／prepared／commitの保持prefixを計算する。knownは通常と元capture firstありの2系列44件、未呼出しは16件。stop／再入もknown22・未呼出し16の各点で別に確認する。全variant×全故障点の直積を成功済みとはしない。

正常／未呼出し／予約済み未呼出し／issuer保持後故障／capture途中stopの6系列、unknown・known不正14種、未開始2種、late context／target／terminal混入9種、先行構築18点を検査する。全返答graphは上限600nodeの固定plain data・freeze・primitiveのみで、symbol／関数／getter／参照漏洩を許可しない。Proxy入力はhook実行0で拒否し、旧A/B状態不変・再run同一性・close後保持を確認する。

compiledはCの処理開始後にだけ混入させ、Bの先行guardで拒否されているだけの偽保証を避ける。同current／issued・brand・guard／bundle／control／duty・live slot間の16関係を1節ずつ外すと拒否からcommitへ変わる。全post10条件と、帰還・route・body／outcome・duty／use状態・空退出cell等18条件も同様に後段で故障注入し、狙ったguardの感度を確認する。capture後のgrant同値copyは退役confirmで再照合され、call除去変異でのみ通る。既存Bの全grant14条件の個別検査はそのまま残す。

冗長な防御の分離：blocked／blockedTargetの2対照は同じlatch検査でも拒否されるため、scratchだけでlatchをattempt後に閉じた値へ固定し、それぞれのpost節を単独検査した。逆に実latchがopenを返す別対照ではpost節が拒否し、その節だけを外すと通る。回収claim未使用の後段対照は同constructionMatchesでも拒否されるため、scratchだけで重複stable検査を外して局所境界を分離した。claimはscratch中だけbeginし、通常の実装・合成script経路では消費しない。これらを無加工経路での単独到達保証とはしない。

未呼出しの全履歴関係、全postの全条件、commit markerの任意破損、全内側guardの全fieldを単独変異で網羅したとはしない。root cache・private固定返答・routeUsed等の再実行防御は多段で、現行通常入口では後段だけの独立到達性を主張しない。将来body／request／closeを接続する前に追加の単独対照が必要である。

commit-beforeとcommit-after／projection故障を分け、確定後のearly return除去による巻戻し・duty同期代入漏れ・確認事実消失を検出する。private参照を内側projectionへ漏らす3対照は外側でfalseへ隔離し、外側も生値に変える変異では不正objectを検出する。旧body入口のthrow sentinelにも到達しない。semantic compile-fail6件はaccepted／issued値・held_unsealed・body phase・ok=true・active stateの拒否である。

最終レビューで新construction.stagesの直接投影を固定許可値投影へ統一した。構築完了直前にscratchで不正objectを入れた対照はunconfirmedとなり、許可値検査を外す変異だけでobjectが漏れることを確認した。未生成slotを成功状態へ既定値化しない。

## 初回の問題と訂正

初回strictと新旧4ファイル384件は成功した。新compiledの最初は`r.blocked`が`r.blockedTarget`にも一致する曖昧な変異anchorで停止した。新compiledのanchorだけを完全な式へ限定した。

次のblocked節対照ではlatchを常にfalseにする試験側の分離方法がattempt前の受付も閉じ、狙ったconfirmまで到達しなかった。attempt後だけを分離する対照へ直した。後段回収claimの対照も、getter-onlyのspentへ代入したため注入自体がthrowしていた。scratchでの正規beginと重複stable防御の明示的分離へ訂正し、拒否→対象節除去時のcommitという対照を確認した。これらの問題を製品の退行や期限不足と扱わず、期限・旧試験・runtimeコードを変更しない。

## 未接続・Unknown

bodyのactive化・起動・return／throw／cancel、active後故障、(C)の候補／同期exit確定・accepted／finished／確認済みinactive、実frame／request合流・全writer停止・Journal供給・admission／packet・field clear・borrow退役／owner解放・root終端は未接続。局所latchとrevokedはOS cleanupの証拠ではない。実会計・追加allocation／guard費・実E／S・layout・OOM・全体work上界はUnknown、全体受付は無効。実期待値pin・実source照合・S発行も行わない。

最終sourceで関連24ファイル1,737件・strict・build・全体lintを再実行し成功。compiled16本に加え、stage許可値対照追加後の新compiledもexit 0。3文書のローカルリンク22件に欠落なし、差分空白エラーなし。変更は合成fixture／試験・CHANGELOG・設計／検証文書だけで、index登録・コミット・Pushなし。

## コミット前の対象限定再検証（2026-11-10）

前節までの未コミット方針は実装時点の記録。本節はその後のコミット依頼に対する検証である。基準HEADは`a1b7be6`（B03-B本体は`ff7e38b`、その後のMDのみのレビュー記録を含む）。B03-C関連9ファイルだけを明示してindexへ登録し、index全体を一時ディレクトリへ展開した。対象9ファイルが作業内容とbyte一致することを確認し、既存node_modulesだけを借用した検証用コピーでbuild・strict・関連24ファイル1,737件・compiled16本を再実行し、全てexit 0。

全体lintはerror 0／既存warning 374でexit 0。梱包dry-runは441ファイル・tests／新fixture／composition fixtureの混入0。3文書のローカルリンク22件に欠落なし、差分空白エラーなし。全repositoryのvitest回帰は今回も未実施。再検証後の追記は本節のみで、実装／試験内容は変えていない。他の作業差分・実接続・実通信・設定変更・Pushは含めない。
