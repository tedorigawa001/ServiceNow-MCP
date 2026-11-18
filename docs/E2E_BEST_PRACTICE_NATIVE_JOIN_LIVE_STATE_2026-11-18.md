# JR-B同shell実運用型・実field post・原始failure／未確認保持の合成検証

Date: 2026-11-18 / 基準HEAD: `dffd871`。
対象: [受渡し設計§9](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_LIVE_WRITER_TERMINAL_HANDOFF_DELTA_DESIGN.md)、[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)、[source試験](../tests/review/native-join-live-state.test.ts)、[strict scratch／独立表](../tests/review/fixtures/native-join-live-state-model.mjs)、[compiled検査](../tests/review/fixtures/compiled-native-join-live-state.mjs)。

## 範囲

同shellの共通準備型と内部実運用view、RoleGenerationSlotの将来の実行variant、実slot／fieldからの15段階post、原始failureとcold未確認metadata保持だけを実装する。実object・初期field配置とliteral-closedのJoinRuntimeShell・14const null aliasを維持し、型assertion・新shell・fake event writer・friend／登録口で昇格しない。

新経路のPromise生成・native安全確認・観測登録／callback body・通知／copy／settler／drain呼出し・private公開・dispatchは未接続。正式発行口／新LM03／C実行／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7・AP01〜06未承認を維持する。実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 独立対照と保証の分離

- 既存の独立値表をspecの合成参照として使い、52の実slot／shell prefixと260のslot／閉鎖field拒否を確認。別途、41種に関数形状のreject差替えを加えたfield不正と期待alias driftの2,236拒否、相関する関係を分離した12拒否を置く。
- 15段階の全組合せでは、正しい段階またはfailure記録点の79受理・701拒否を確認。registering前後、ack held／verifiedの途中とchecked完了を混同しない。
- 同originのforeign／同値copy／Proxy／revoked Proxyの32拒否を確認。実postはcallerのprojectionを取らず、native objectやpayloadを呼び出さない。正常postのtrueを生成資格にはしない。
- 原始failureの6対照で、最初のsite／fault・先行HTTP／取消のprimary・同期revokedと実pending／保持positionを残す。cold保持の22対照はreadonly／accessor／missing／frozen・shell未取得・descriptor prototype汚染を含み、hook 0。前提不足の10拒否ではmetadataを変更しない。
- 正常post後も元request2経路・3closure×2roleの6経路は固定拒否。constructor／entry claimはfalse、candidateはnull、上位診断は不変。
- ASTはprimitive writerのcall／反射／割当て0、更新先は自roleのfaultAt／fault・元primary／revoked・phaseだけ。cold保持はdescriptor取得2＋own tag検査2で、own writable data確認後のmetadata2fieldだけを書く。新block全体の禁止能力7対照と製品caller 0を確認する。
- semantic正対照と不正10行で、同objectの広い内部view・実行slot位置、cleanup reject／run専用payload禁止、immutable origin、旧seedのfalse literal、新段階の有限値を検査する。

sourceの新規試験は43件。上記の内部assert数をsource成功件数へ加算しない。実行段階の正対照はstrict scratchコピーだけで14aliasのconst宣言をletへ変え、独立表のfake関数／objectを同shellと期待aliasへ固定したもの。製品の宣言・取得writerは変更せず、値関係の確認を実際のnative生成／観測／終端の証拠にしない。fixture台帳をruntimeへ持ち込まない。

## RED・初回失敗・変異の扱い

最初のtracerは新block未実装のmarker欠落で1件RED。次の対照は、未検査だったdispatch fieldと未実装failure関数で2件REDとなった。限定実装後のack段階ではreturn直後の改行による自動セミコロン挿入でundefinedを返し、試験1件と型検査4診断が失敗した。同期分岐をblockにしてboolean復帰を固定し、再検査した。

初回の30変異では5件が独立対照を通過した。4件は、値の型不正を別条件が先に拒否してalias比較を検証できていない、または不正pairでも期待aliasを同時に揃えた対照が欠けていたもの。別の適格関数への差替え・期待work aliasだけのdrift・同aliasの不正run／cleanup pairを加えた。

残るwritable guard省略は、strictのreadonly writeがcatchされるため、この閉鎖単位の返却／保持結果では等価だった。これをbehaviorで検出したとはしない。metadataを書けないときは試行せずskipする固定契約を、各write直前のown data／writable条件のAST確認で別に検査する。30構文正常変異は29件をbehavior、1件をこの構造対照で検出し、等価性と静的契約を区別した。変異生成のdrift／構文検査は期待例外区間の外に置く。

既存value試験のcall graph期待値だけは、origin leafの唯一の追加callerが閉鎖した実field postであることへ更新した。新post・primitive failure・cold保持への製品callerは0で、既存requestと3closureの本文は変更しない。

## 最終確認と未実施範囲

新規sourceは43件成功（2.93秒）。関連6fileは232件成功（13.75秒）、最終の関連14fileは464件成功（13.72秒）。元の個別5秒／既定並列度、旧child60秒・製品全体60秒は変更していない。build・type-check・変更TSのESLintはいずれもexit 0。

固定dist compiledは新規1本と既存12本の計13本成功し、全childが元の60,000ms期限内でexit 0・signalなし・実行errorなしだった。実測はlive-state1,723ms、values717ms、seed1,344ms、handlers8,748ms、pin3,492ms、generation171ms、construction649ms、control92ms、facts53ms、pure53ms、workflow71ms、status69ms、session77ms。新fixtureは固定distだけを読み、d.tsへの内部型／検査／writer名の漏出も拒否した。

旧14関数と6個の割当て／固定拒否関連関数の本文、4exportは基準HEADとbyte一致する。新MJS2fileの構文確認も通過。offline／ignore-scripts・当該操作専用の一時cacheを使った梱包dry-runは441file・配布JS109fileで、tests／private evidence root／新検査名の混入はない。一時cacheは削除し、依存・package／runner設定は変更していない。

文書4fileのlocal link44件・表19個・既存設計ID45個の順序／重複／欠落、末尾改行・差分空白を静的確認した。意図した10fileだけが変更され、stage0・HEADは基準のままで、他の作業中変更は開始時からなかった。ソースの新3継続に製品callerがなく、取得／観測／終端を起動する入口を追加していないことをsource／固定distの両方で確認した。

全体回帰、新経路の実Promise・native resource／session・worker接続、安全な候補のnative認定・実callback・固定abort／終端、実backing容量・完全回収・最終discardは今回の保証外である。metadataを保持できなければprimitive失敗と元参照だけを残し、未確認を成功へ補正しない。

## コミット対象だけの再検証（2026-11-18）

基準HEAD `dffd871` のarchiveへ今回の10fileだけを反映した分離snapshotで再検証した。既存node_modulesを同じ実体で参照し、依存の再取得・更新や設定変更はしない。開始時のSHA-256で対象を固定し、検証後に元作業領域との一致とHEAD不変を確認した。

- build・type-check・変更TSのESLintは全てexit 0。
- 関連14file・464件成功（13.80秒）。元の個別5秒期限・既定並列度を維持。
- 固定dist compiled 13本成功。live-state1,736ms、values765ms、seed1,403ms、handlers8,891ms、pin3,546ms、generation169ms、construction630ms、control90ms、facts53ms、pure55ms、workflow69ms、status67ms、session77ms。各childは元の60,000ms期限内でexit 0・signalなし・実行errorなし。
- offline／ignore-scriptsの梱包dry-runは441file・配布JS109file。tests／private evidence root／新検査名の配布混入なし。一時cacheは当該操作後に削除した。
- 旧14関数と6個の割当て／固定拒否関連関数、4exportは基準HEADと一致。新MJS2fileの構文確認も通過。

検証後の追記は本節と親2文書のStatus整合だけで、実装・試験・設定は検証済み内容から変えていない。このMD追記もsnapshotへ反映して静的確認する。対象外変更は含めず、各閉鎖条件・Unknown・調査保留を維持し、Pushは行わない。

## レビュー修正 2026年11月18日

レビュー基準と修正時のHEADはどちらも`f9a8be2`。設計は[受渡し設計draft-0.3](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_LIVE_WRITER_TERMINAL_HANDOFF_DELTA_DESIGN.md)§9。製品コードは変更していない。

| 指摘 | 原因と対応 |
|---|---|
| 試験が見逃す条件25件 | 一時変異61件のうち32件が全oracleを通過し、25件は非等価だった。境界対照が崩すのは取得系と末尾fieldだけで、準備field・slot・失敗段階・一部の取得／観測関係を崩す行がなかった。受理される行から1条件だけを変える対照を加え、25件を構文正常変異へ追加した |
| 版参照の更新漏れ | JoinRuntime設計が受渡し設計をdraft-0.1として参照していた。seed契約設計とseed→実行設計はStatus・本文を書き換えたのに版が据え置かれていた。受渡し0.3、seed契約0.7、seed→実行0.6へ上げ、設計文書の版参照を直した。過去の検証記録の版表記は当時のまま残す |

追加した対照は次の610拒否である。

- 通常段階の25行（run13・cleanup12）×13条件＝325。readiness／retention・pinState／pinFault・handlersの5field、slotのfault／faultAt／claimed／phase。
- 失敗段階の27行（run14・cleanup13）×10＝270。failure_recorded／failed_retainedの両方でrevoked／primary／site／phase、failed_retainedだけでreadiness／retention。後者はfailure_recordedでは受理のままであることも確認する。
- 書込み不可のreadiness／retentionで原始failureを記録した4件。failure_recordedは成立し、failed_retainedは成立しない。
- 取得／観測の関係11件。到達前のack保持、registering中の不正ack、normal_exitでsettler組が欠ける場合、未保持候補のunsafe（各role）と、関数でないresolve／run reject。各対は変更前の行が受理されることも確認する。

先行REDとして、追加した25変異は旧oracleで25件とも通過した。新oracleでは55変異（behavior54・構造1）がすべて検出され、変異1件あたり1.5秒未満だった。関連のlive／value試験は105件成功（live 69件）。

等価として扱った7変異：registering／checkedのbusy・ack保持・位置の条件は観測postまたは保持位置の照合が先に同じ結論を出す。terminalCopy／rejectPayloadの期待aliasは製品でconst null。cold保持のsubject null判定とrecord側のrole判定は、try／catchと型付きcallerのため結果が変わらない。Promise生成・closure呼出し・観測・終端処理・private公開・dispatchは未接続のままで、各閉鎖条件・Unknown・調査保留を維持する。
