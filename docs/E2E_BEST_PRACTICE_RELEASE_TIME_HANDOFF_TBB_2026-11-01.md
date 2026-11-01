# CT-B TB-B：accepted値・正常source解放・元run失効の合成接続

Date: 2026-11-01 / 基準HEAD: `951071b`。
Status: **既存classの固定fake経路だけの限定実装。通常実source・実接続・実通信には未接続。**

[時刻owner詳細設計draft-0.4](BEST_PRACTICE_ABORT_SCOPE_RELEASE_TIME_OWNER_CTB_DESIGN.md)§10と[上位時刻接続契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)を参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、設定変更・Permit発行・Pushは行わない。

## 1 生成元・所有権・正常終端

[CT-A owner](../src/servicenow/review-kernel/release-comparison-receipt.ts)にtakeAcceptedTimeを追加した。accepted値をguard前に取り外してtransferringへ進め、同projectionのpre/post guard後だけ同Oを返す。draft／rowsを転送せず、二重消費・copy／別projection・close後の消費は拒否する。inspect値から消費を再構築しない。

[固定bridge](../src/servicenow/review-kernel/release-time-handoff.ts)が同CT-A ownerとTB-A scopeを固定生成し、同Oのobserve→issue→acceptを同期接続する。contextはrun／budget／origin、bindingは同session／source／keyと元S／全L。値factory自体は任意fakeから作成可能な非実行部品で、真正なsessionの権限を発行しない。

[実class](../src/servicenow/bounded-read.ts)でbridgeを生成するのは、既存の#consumeReleaseInputが成功する一度限りの固定fake-200継続だけ。元#runOwner／#budget／#releaseInputOriginを結合する。任意bridge／scope・O・完成draftをcallerから採用する口、sessionを後から登録する台帳、friendは追加しない。

legacyのmatched／prepared成功後だけaccepted値をhandoffする。正常sourceClosedは下位receiptをcloseし、下位guardから元run guardへ切り替える。固定finallyで観測slot・consumer・contract・予約枠を解放し、成功した固定上位継続でdiscardしてからsessionをcloseする。空200も従来の設定代替が成立しなければ移譲せず停止する。純粋bridgeがunknownの空200を運ぶことは、本番fallbackの有効化ではない。

## 2 失効・解放・診断

元runの同期stop／取消／異常rollbackは上位値も失効させる。正常source解放後にsource側hookが解除されても、sessionのstopから直接失効させる。元run guardはS／L・元origin／sourceを検査し、正常解放された下位sourceの生存を要求して復活させない。

finallyの解放sectionは固定数・固定順序で全て試み、移譲側guard失敗で後続の解放を飛ばさない。先行codeは元runの既存診断を優先し、時刻側は固定code／phaseの一度限りprivate copyだけを保持してから値／identity参照を捨てる。HTTP／cleanupの既存ownerは変更せず、新しい公開診断・時刻fieldはない。物理的heap消去やcallerが持つdata copyの破棄は主張しない。

## 3 試験と保証の分離

[bridge／donor試験](../tests/review/release-time-handoff.test.ts)では、acceptedの消費、空200のO保持、正常source解放後の保持・固定discard、別projection／context／copy拒否、重複・再入、転送10guard・sourceClose／discardのpre/post停止、先行理由と正規化診断の分離、読めない例外objectの固定化を確認する。

[実class fake試験](../tests/review/release-time-handoff-session.test.ts)は空200・実測の従来summary／C/G/P・予約返却・時計採取2回を維持し、legacy非admittedで移譲しないこと、遅い単調clock境界の即時／microtask取消後に同principalで新規実行できること・timer解放・秘密非出力を確認する。private上位O／診断copyを新friendで直接取り出していないため、値bridgeのinspect保証と実classの回帰保証を混同しない。

既存native／typed bootstrap試験ではcleanup未確認でconsume／ackが成立しない境界と二軸診断を維持する。fake transcriptは固定200・確認可能なnative resourceだけを生成するため、同class transcriptに任意の未確認cleanupを注入した試験とは主張しない。

[compiled fixture](../tests/review/fixtures/compiled-release-time-handoff.mjs)はdistの固定bridgeと実classのsynthetic_ioを使う限定試験。B-03の専用開発assembly保証とは別。公開JSON・worker protocol・実Permit採用・実通信は追加しない。

## 4 初回失敗・確認経緯

| 段階 | 結果と対応 |
|---|---|
| accepted消費の最初のRED | Oを返すだけのstubではaccepted値・draftが残り、transferredへの遷移期待1件が失敗。先行消費・pre/post guardとterminal状態を追加してGREEN |
| 正常cleanupのRED | bridge stubでは上位値を保持せず、source_closed期待1件が失敗。固定CT-A／TB-A接続と正常source／元run guard切替でGREEN |
| 読めないエラーobject | 30件中1件が固定内部理由ではなくPRIVATE_TRAPで失敗。code descriptor取得自体の例外が原因。取得例外も固定内部理由へ正規化して両側を破棄しGREEN |
| cleanup合流の型検査 | TS2322、既存#adoptがunknownを返す経路があるためBoundedReadError slotへ代入できなかった。既存型を緩めず、先行固定codeを採用してBoundedReadErrorへ正規化。再build成功 |
| 終端の静的照合 | 正常source解放のfinallyがsource側失効hookを解除するため、その後の上位保持中はsession.stopから直接失効させる必要があると判明。固定stop hookを補強し、即時／microtask取消の回帰とcompiled ASTの直接呼出し検査を追加。private上位値を公開する観測口は追加していない |

旧試験は削除・skip・期待緩和していない。TB-Aのdiscarded終端を保持する前工程の修正も維持する。上記のREDは今回の段階的実装の記録で、旧製品で同じ欠陥が実際に露出していたとは主張しない。

## 5 検証結果

| 検証 | 結果 |
|---|---|
| 最終版関連回帰 | 12ファイル／313件成功。新規39件（donor／bridge34件、実class fake5件）と既存274件 |
| build | cleanup合流の型エラー修正・直接stop hook補強後に成功 |
| standalone TypeScript | 新規2試験のstrict型検査、エラー0 |
| オフライン梱包 | `node tests/review/package-http-classification.mjs`成功、441ファイル。新bridgeの4成果物、固定依存／時計・I/O禁止AST、private宣言非露出、stopの直接失効AST、既存＋新compiled fixtureを確認 |
| 補強前の全体合成 | 235ファイル／10,177件成功、失敗0・pending 0、約353.7秒。stopの直接失効補強・queued取消1件追加前の結果として分離し、最終版の全体保証へ流用しない |
| 最終版の全体合成 | 235ファイル／10,178件成功、失敗0・pending 0、新規39件を含む。JSON内の開始〜最終試験終了は約110.1秒 |
| 文書・差分 | 更新8文書のローカル参照122件・版数参照24件が整合。`git diff --check`と新規5ファイルの末尾改行／空白検査が成功 |

補強前の全体結果は`/tmp/servicenow-tbb-tests-20261101.json`。最終版は`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-tbb-final-tests-20261101.json`で別実行した。JSONはローカル一時成果物で、本書に恒久結果を記録する。別build／testと重ねず単独実行し、製品60秒・210試行・受信上限、試験の期限は変更していない。実行秒数の差を性能保証や通常並列の再発解消とは解釈しない。補助package-workerの依存取得試験は実行していない。

コミット前確認：候補16ファイルを含むindex全体を一時コピーへ展開し、既存node_modulesだけを参照してbuild・関連12ファイル313件・新規2試験のstandalone TypeScript・441ファイルのオフライン梱包を再確認し、すべて成功した。候補16ファイルのbytes一致と、無関係な`.vscode/`・`CLAUDE.md`がコピーに含まれないことも確認した。全体10,178件はこのコミット前確認では再実行せず、上表の実装時結果と区別する。確認後の追加変更は本段落だけで、実装・試験は変更していない。

## 6 残課題・非主張

CT-B後半の同worker世代／job claim・T_i／E、CT-C、B-03、元Lと出力宣言deadlineの整合、日時長cap・追加work／全体上界は未解決。TB-Bのupperは固定fake準備処理内でdiscardし、closeしたsessionを越えるworker終端ownerへは渡さない。比較候補を既存release decision／Permitへ採用せず、非200 fallbackも有効化しない。

追加費目は固定bridge／context／binding・各guard・accepted消費・診断copy・固定解放合流。新GET・時計採取・rows decode・受信再課金、新budget／期限更新はない。有限slot数を全体受付の根拠にしない。
