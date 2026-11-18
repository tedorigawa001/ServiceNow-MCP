# JR-B seedから実行状態へのclaim・settler保持・post接続差分詳細設計

Version: native-diagnostic-jrb-seed-execution-transition-draft-0.6 / Date: 2026-11-18。
Status: §9の実行variant・origin leaf・段階別値postと、§10参照先の閉鎖実運用型／実field post／failure保持だけを合成依存限定で実装。設計基準HEADは`07b4c45`、値契約限定実装の基準HEADは`a477987`。[未使用seed設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md)EI02〜06・ES05〜06・EW02〜06と、[closure／tuple設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_HANDLERS_POST_TERMINAL_DELTA_DESIGN.md)HP04〜09を具体化する。[JoinRuntime設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JOIN_RUNTIME_GENERATION_DESIGN.md)と[固定pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)の同owner・同P・観測／固定終端の一体接続は変更しない。

draft-0.6のレビュー修正：レビュー修正の基準HEADは`f9a8be2`（修正時のHEADは`f9a8be2`）。同コミットで、Statusと§9の製品caller記述を実field postの限定実装に合わせて書き換えた一方、版はdraft-0.5のままだった。版を上げ、参照元の版参照を直した。受渡し設計への参照もdraft-0.3へ更新した。内容・実装は変更していない。

draft-0.5のレビュー修正：レビュー修正の基準HEADは`3755cba`（修正時のHEADは`50a2ef1`）。§9の観測値postは、refusedに登録到達trueを、到達前のrefusedにreturn_lostを受理し、逆にET01が到達の有無で区別する到達前throw（threw・未到達）と最終post前のregistering／busy・未到達を拒否していた。独立oracleも到達前throwを不正値へ入れていた。refused＝未到達、returned＝到達、registering／threw＝到達前後のいずれも可、return_lost＝到達後に限定するよう値postを直し、oracleを設計側へ揃えた。あわせてvariant名の付け替え、失敗保持・観測fieldの関係、origin leafが照合する保持field（executor closure・tuple・cleanup record・anchorのslot参照）の改ざんを拒否する対照を加え、構文正常変異を14件から28件へ増やした。

draft-0.4のレビュー修正：レビュー修正の基準HEADは`6c798d9`。§10に受渡し設計への参照節を加えた一方、版はdraft-0.3のままだった。版を更新し、参照元のJoinRuntime設計・seed設計・構築Join設計・受渡し設計の版参照を直した。内容・実装・試験は変更していない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`a477987`（修正時のHEADは`3755cba`）。§2はslot.phaseをbuildingからchecked、slot.positionをexecutor／reject／resolve／candidate／checkedへ進める前提だったが、現行RoleGenerationSlotはbuildingのpositionがruntime〜handlersに限られ、checked phaseも持たない。§2はshell型の拡張方針だけを定め、実slot型の扱いを書いていなかった。§2へ実slot型の限定拡張条件を追記した。§9の値投影・実装・試験は変更していない。

正式発行口／新LM03／C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown、VM／監視／telemetry調査保留、LOAD6／LOAD7選択・AP01〜06未承認を維持する。draft-0.1のMDだけの設計・静的確認は§8に残す。draft-0.2は非実行の値検査と合成／compiled検査だけを追加し、Promise生成・private公開・dispatch・実接続・実通信・実機操作・設定変更・stage・コミット・Pushは行わない。

## 1 現行と差分の決定

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)のJoinExecutionSeedは初期literalだけの型であり、executionSeedUnusedはpreparedHandlersMatchedの未使用postを確認する。requestJoinExecutionは正常seedも必ずfalseへ拒否し、constructor／entry claimを消費しない。3closureもrejectClosedJoinHandlerによる固定拒否で、native setterを保持・呼出ししない。

最新の[閉鎖call補強記録](E2E_BEST_PRACTICE_NATIVE_JOIN_HANDLERS_PREP_2026-11-17.md#レビュー修正-2026年11月17日)は2role×3関数の直接call・origin不一致2件・tuple／position postを検査したもの。[未使用seed記録](E2E_BEST_PRACTICE_NATIVE_JOIN_EXECUTION_SEED_2026-11-17.md)の初期field検査と併せても、native executor入場や候補観測を実装済みとはしない。

差分の方針は、既存requestJoinExecutionを正常生成口へ転用せず、将来の同root lexical区間に一つのprivate生成継続を設けることである。本書ではその契約名をadvanceJoinCandidateと呼ぶ。製品export・friend・登録口・raw入力・実行flagから到達させず、legacy execute／cleanも呼ばない。将来の合成一体試験は同ownerのscratch導出だけからこの継続を検証する。同名関数を今回実装するものではない。

advanceJoinCandidateの存在や型・boolean postだけではconstructor資格にならない。同ownerの固定call site、管理されたrealmで捕捉した同P、同executor、後段の安全観測・固定abort／失敗終端までの保持責務を揃えた後続実装単位だけが呼べる。現在の拒否executorをそのままnew Pへ渡す変更は、settlerを持たないpendingを作り得るため不可である。

## 2 同objectの段階variantと既存型からの差分

主保持先は同RecoveryAnchorのrunGeneration.pending／cleanupGeneration.pendingのままで、shell・identity／pin・3closure／tupleをcloneしない。roleは同生成closureの固定値、runは同RunLink、cleanupは同ResourceDutyと保持済みcurrent record／anchorへ結合する。原始期待aliasは同捕捉／返却値から一度だけ記録し、可変fieldから再pinしない。

実行型は、共通の不変origin・準備履歴と下表の判別可能な運用fieldの組として定義する。現在のliteral seedへboolean／nullable参照型をintersectionするだけではfalse／null制約は外れないため、そのような型偽装をしない。共通部分を最小抽出し、unused投影と実行variantを区別する。実objectを別完成objectへ交換せず、同fieldへの固定writerと実参照／値postで進行を確認する。type assertionだけで成功variantへ昇格しない。

| ID | variant／安定点 | 必須field・位置・禁止 |
|---|---|---|
| SV01 | unused | constructorClaim=false／not_called、entry未使用／not_entered、settler／candidate／workなし、観測／drain未開始。既存seed checkerの対象はここだけ。通常はposition=handlers |
| SV02 | claimed_pre_call | constructorClaim=true・constructorState=not_called、entry=false、位置handlers。消費後かつ呼出し未到達を表し、ここで失敗してもclaimを戻さない。native生成の実績にはしない |
| SV03 | calling_before_entry | constructorClaim=true・calling、同P／executorの固定呼出し区間、entry=false。位置handlers。calling値だけから外部関数をnative引数として採用しない |
| SV04 | capturing | entry=true・executor=running。位置executor→runのreject→resolve、cleanupはexecutor→resolve。取得済み参照と期待aliasが同一、未取得はnull。setter呼出しは0 |
| SV05 | captured_before_return | runは同reject／resolve、cleanupはresolveとreject=null、executor=normal_exit。constructorはまだcallingで、candidateHeld=false。executor正常退出だけでwork取得を報告しない |
| SV06 | returned_candidate | constructor=returned、candidateHeld=true、返却unknownを直保持しposition=candidate。正常生成には正常退出・正規pairが必要。異常退出等の先行faultがあればfailed_retainedのまま候補保持だけを行う |
| SV07 | checked_unpublished | 同candidateの安全確認・work alias・一度の観測登録・ackの全post後だけprivate checked。正常body・公開・dispatchの権限ではなく、未dispatchの固定abort／終端へ必ず合流 |
| SV08 | failed_retained | 各claim・最後の保持prefix・最初のfault・取得済み参照を保持。constructorのthrew／executorのabnormal・半pair・候補未取得も区別。安全な同候補観測と限定終端は別資格で、成功phaseへ戻さない |

shell.readiness=handlers_readyは3closure／tupleの準備履歴であり、constructor／観測を包括して許可するreadyではない。失敗時はfailed_retainedへ移すが、handlersState／detail／handlersFaultへ後段の失敗を混ぜない。slot.phaseはbuildingから全post後のchecked、またはfailed_retainedとし、published=null・dispatchStarted=false・entered=falseを維持する。

実slotのRoleGenerationSlotも同じ方針で扱う。現行のbuilding variantはposition runtime〜handlers、failed_retainedはJoinPreparationPositionだけを持ち、checked phaseはない。後続の一体実装では、constructor claim消費後のbuilding position executor／reject／resolve／candidate、phase checked（position checked・pending同shell・fault null）、実行位置を保持するfailed_retainedを判別可能なvariantとして追加する。既存のempty／claimed_unheld／building（runtime〜handlers）とJR-A・pin・handler・未使用postの期待値は緩めず、新variantを書けるのは§4の固定writerだけとする。type assertionや値投影（§9のJoinExecutionValue）の一致だけで実slotを昇格しない。

期待alias14個のconst nullは、後続の一体実装で必要な取得fieldだけを同roleのwrite-once保持型へ限定拡張する。cleanupのcapturedRejectExpected／terminalCopyExpected／rejectPayloadExpectedはnull固定。copy／payload aliasをexecutorが書いたり、別ownerの期待値へ交換したりしない。未使用postには従来の全null確認を残す。

## 3 固定拒否を外せる区間と外せない区間

下表は将来のbranch契約で、実行可否を選ぶcaller mode／executionEnabled入力／採用ticketを追加するものではない。

| ID | 区間 | 許可される動作／固定拒否 |
|---|---|---|
| GW01 | 既存requestJoinExecution・pristine seedの直接call | 要求は従前どおりfalse。3closureの直接callも既存closed_call拒否を維持し、native引数の採用・setter呼出し・value／reason hookは0 |
| GW02 | advanceJoinCandidateのpreflight・claim消費後未到達 | 同owner・未使用seed・全初期field／alias・同record／pinを確認するだけ。ここではexecutor／観測closureを手動起動しない。早過ぎるcallは拒否しclaimを成功へ補完しない |
| GW03 | 同固定call siteのconstructor calling、entry未使用 | 同root／slot／pending／identity／pin・同executorと原始呼出し履歴が一致する区間だけ、executorを参照捕捉bodyへ分岐させる。新規raw関数を受け取る別口はない |
| GW04 | entry消費後・捕捉中 | 初回frameだけが同引数の参照を固定順で記録する。二重／再入executorは新しい引数を採用せずexecution faultを保持。外側frameを正常化・再開始しない |
| GW05 | constructor復帰／throw後・停止後のexecutor call | constructor窓は閉鎖。既取得settlerの交換・再捕捉・第二constructorを拒否する。実行後のfaultを準備closed_callへ戻して位置／handlers履歴を壊さない |
| GW06 | 同workへの正規観測登録後 | fulfilled／rejected closureにはconstructor資格とは別のEW04資格が必要。同registrationWork・共有callback claim・登録到達を満たす正規反応だけを原始記録する。constructor callingだけでは観測bodyを許可しない |
| GW07 | failed_retained／revoked／sealed／current交換後 | 新規run生成・正常受理は拒否。既登録の同workの正規後着反応はprivate事実だけを書けるが、別recordのcleanup適格性や公開／sealed診断は変更しない。未知候補のthen／joinは拒否 |

GW03は状態flag単独をnative呼出し証拠にする規則ではない。closureが外部へ漏れず、固定継続から捕捉済み同Pを直接呼ぶ管理されたrealm・private control flowの前提に依存する。関数名／length／文字列／stack、同値projection、fixture台帳やcaller関数では代替しない。module捕捉前の任意改変・任意の内部field破壊まで真正性を保証したとはせずUnknownを維持する。

pristine seedの閉鎖callは[既存6 call・origin不一致2件の期待値](E2E_BEST_PRACTICE_NATIVE_JOIN_HANDLERS_PREP_2026-11-17.md#レビュー修正-2026年11月17日)を残す。constructorClaim消費後の範囲は別の実行fault writerを使い、同role slotの最初のsite／code→空の場合だけroot primary→同期revoked→保持責務の順に記録する。既存failJoinHandlersへ一律合流してpositionをhandlersへ戻さない。新しいfaultを別primary ownerにせず、先行HTTP／取消／期限を保持する。

## 4 constructor／entry claimとrole別settlerの固定保持順

| ID | 同期操作 | 保持・失敗境界 |
|---|---|---|
| CS01 | 生成・安全観測・固定drainを対にできる閉鎖継続の構成確認 | 途中で試験assertが失敗しても固定finallyへ責務が残ることが前提。終端／未確認保持先が不明ならconstructor呼出し0で停止 |
| CS02 | 同owner leaf→unused post→元run／同record cleanup条件→直前live pin／固定操作確認 | raw参照比較が先。実引数にはcallerのconstructor／executorを採用しない。元の期限／予算検査は元owner・元位置のままで、新clock／sample／floorは作らない |
| CS03 | 同executor・shell／identity／pin／slot／roleをlocal canonical参照へ固定→constructorClaim=true | closure生成・tuple再生成はしない。ここでJR-Aのstarted／生成claimを再消費しない。消費後未到達でも位置handlers・非返却claimを保持 |
| CS04 | constructorState=calling→捕捉済み同Pへ同executorを一度だけ渡す | 直前postからnative callへcaller callback／await／通知／任意依存を挟まない。state代入だけをnative call成功と数えず、同期throwも一度の試行として扱う |
| CS05 | 固定executorの同origin／calling／未使用entryを原始fieldで確認→entry claim=true→running／position=executor | 引数参照を保持する前にentryを消費。executor内部ではdescriptor再取得・snapshot・Error確保・queue・setter呼出し0 |
| CS06 | runだけ、渡された第2引数rejectを同shellとcapturedRejectExpectedへ直接保持→position=reject | native executor引数の並びはresolve／rejectだが、保持順はrejectが先。同originと必要な関数の条件を満たさない場合は採用せず半prefixを保持。cleanupはこのstepを経ずreject=null |
| CS07 | 渡されたresolveを同shellとcapturedResolveExpectedへ直接保持→position=resolve | run／cleanupの同role用参照だけ。cleanupは渡されたrejectを保持・呼出しせず、run pairを代用しない。typeofだけで外部関数をnative起源へ昇格しない |
| CS08 | role別捕捉post→executor=normal_exit／undefined復帰 | 失敗ならabnormalと最初のsite・実prefixを残す。半捕捉後に不足関数を再取得して正常退出へ補完せず、外部throw本文を保存しない |
| CS09 | constructorが返した値をcandidate／candidateExpectedへ即保持→candidateHeld=true・returned・position=candidate | 検査／通知より前に同参照を保持する。先行executor faultがあっても返却参照は失わない。constructor throwならthrewと先行prefixだけを保持し、未返却candidateを推定しない |
| CS10 | executor外でcapture／candidate post→安全観測へ、またはfailed_retainedの限定観測／drainへ | 生成成功と観測安全性は別。条件が不成立でもclaim／候補をclearせず、未知値をawaitしない。生成後の正常候補も未dispatchのまま固定abortへ合流 |

constructor／entry claim、state、位置は個々の事実を表す。固定原始群の途中で保持不能になれば成功variantではなくfailed_retainedの部分履歴にする。callingからreturned／threwへの記録は当該constructor継続だけ、runningから退出への記録は当該entry frameだけが行い、内側の拒否frameが外側の退出やbusyを代行しない。

executor入場後は、既に許可した同呼出しの参照捕捉だけを行う。cleanupの先行primary／revokedを再び新規run条件として拒否しない。一方、新しいlocal実行faultまたはorigin喪失後に次の関数を採用して半prefixを補完することもない。生成前の停止はCS02で拒否し、捕捉途中の故障は実prefixと後で返却された同candidateを保持する。executor内に停止通知やcaller hookを挟んで故障を誘発する採用口は作らない。

## 5 段階別post：未使用検査の維持と限定的な差替え

| ID | post／leaf | 固定の確認対象と結果 |
|---|---|---|
| PP01 | unused seed post | 既存executionSeedUnused・joinExecutionFieldsUnusedのfalse／null／初期descriptor契約を維持。constructorClaim消費前だけに使い、実行中fieldを許すために緩めない |
| PP02 | pre-call post | 同canonical集合・handler／tuple完了・未使用claim・固定P／pin live・元停止条件。最後に必要なlive／descriptor確認を済ませ、以後の同期群に任意介在0 |
| PP03 | executor entry leaf | 同closureの固定origin・constructor calling・非返却claim・未使用entry、同role／slot実参照と事前確認済みdataを原始値で検査。現行handler postの全null条件やlive descriptor再取得を呼ばない |
| PP04 | capture prefix post | runのnull→rejectのみ→pair、cleanupのnull→resolve・reject=nullと、各期待alias／位置／entry frameを照合。関数形状・値copyを起源にせず、取得済み参照の交換を拒否 |
| PP05 | constructor復帰／candidate post | returned／threw・executor正常／異常・candidateHeldと取得値を独立照合。正常生成判定がfalseでも、取得済み候補の保持を取り消さない |
| PP06 | candidate observation post | 同取得候補のnative brand／prototype／constructor／species、捕捉P／thenのlive条件と固定tupleを確認。生成成功やprimaryなしを必須条件にせず、安全な失敗候補だけを一度観測可能とする。新規生成資格は与えない |
| PP07 | registered reaction leaf | 同registrationWorkとcanonical alias・同handler・登録到達・共有callback claim・非登録busyを確認。raw value／reasonを読まず原始観測だけ。failed／revoked／sealed・current一致を包括的な拒否条件にしない |
| PP08 | failed custody／drain post | 同retained集合・各試行履歴と必要settler／安全payloadを操作別に照合。pristine seedやnormal readyへ戻す必要はない。試行復帰・work反応・callback退出・ack終端・resource確認は別軸 |

PP03／04／07は新しいorigin leafであり、反射や正常生成の条件を含む既存checkerを名前だけ変えて流用しない。foreign／copy／Proxyは自ownerの参照を使うleafで先に拒否し、外部fieldを読まない。生成前にはown writable dataを検査するが、登録後のcallback内でdescriptor／時計／予算／snapshotを再取得しない。

候補の安全確認は[固定pin設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_RUNTIME_PIN_DELTA_DESIGN.md)の管理された同realm条件を再利用し、candidate.thenの直接読取り・unknown thenableの同化・instanceofだけ・現在値の再pinで代替しない。登録claimとbusyは適用前、ack候補の保持は返却直後とする。同candidate／work、同tuple、最大1個のackを維持し、確認用thenの列を増やさない。

## 6 固定abort／失敗終端との接続条件と失敗保持

本書はconstructor区間だけの有効化を承認しない。後続実装では同private生成継続の責務が、正常候補・失敗候補のいずれでも固定finally／drainへ残るようにする。生成済みworkを保持したままassertで退出して未処理にせず、試験側の偶然のGCやprocess終了をwork終端の証拠にしない。未知候補は無期限joinせず固定拒否と未確認保持へ分ける。

| ID | 失敗位置／事象 | 保持・停止と後段条件 |
|---|---|---|
| FF01 | claim前のowner／seed／停止／pin拒否 | 同roleの最初の理由・元primary・取得済み準備を保持。constructorClaim未消費でも生成再利用不可。foreignへの書込み・native call 0 |
| FF02 | constructor claim消費後・entry前の失敗／throw | constructor claimとnot_called／calling／threw・位置handlersを保持。native call未到達とconstructor throwを区別。entry／候補があったと推定しない |
| FF03 | executor二重／半捕捉／異常退出 | entry claimと実settler prefix・最初のsiteを保持。引数関数を呼んで真正性を試さず、再捕捉0。constructorが返れば同candidateを直保持 |
| FF04 | 生成post不成立・候補不適格／pin drift | 正常生成成功へ戻さない。安全な候補だけPP06で限定観測。未知then／別work／再constructor 0、元参照は保持 |
| FF05 | 観測登録throw・ack喪失・callback不正 | 登録到達・claim・同workと取得済みack・callback事実を別保持。再登録／別observer／global listenerで救済しない。正規後着だけをprivateへ記録 |
| FF06 | 通知／copy／payload／settleの失敗・再入 | 未使用seed設計ET04〜07の一度限りdrainを再利用。元理由と各試行・実復帰を残し、copy／settleの再試行0。CPの0計数copy・正常snapshot fallbackで補完しない |
| FF07 | 終端・退出・resource責務が未確認 | 同pendingとretention=unconfirmedを保持。void／settler復帰／seal／busy=falseをcleanup confirmed／全解放にせず、最終discardは別gate・Unknown |

runの終端は同ownerの検証済み実copy、不能なら保持した固定internal_review_errorを同rejectへ渡す限定処理とする。cleanupは適格な同resolve(undefined)だけを使う。いずれも未観測をpendingの証明にせず、既rejectを後続resolveで修復したとは扱わない。通知の共有履歴・copyのthen安全性・既sealed upperの不変条件は[未使用seed設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md)EF／EW／ETを維持する。

workの正規反応、callback退出、ackの実終端は別事実である。runtimeに確認手段のないackTerminalを成功へ補完せず、scratchの有限awaitによる確認結果を製品へ再投入する口も作らない。登録後の復帰喪失など危険なnative故障対照は、有限な別child／終了契約の承認・整備なしには実施しない。

## 7 将来の合成受入条件と非実行の分割

| ID | 対照 | 必須の受入条件 |
|---|---|---|
| TA01 | 既存要求・pristine closureの閉鎖対照 | requestはfalse、2role×3関数の直接拒否とorigin不一致2件のcode／site／先行理由・参照保持を維持。setter／raw hook／通知等0。固定拒否を全体から除く変異を拒否 |
| TA02 | 型／variant・fieldと窓の混入 | 初期literal、claim済み未到達、calling、半pair、returned／failedを区別。run半pair／cleanup reject混入・同値copy・foreign／Proxyを拒否。型／boolean／fake eventからauthority復元0 |
| TA03 | constructor claim前後・entry前後 | 同P試行最大1、entry最大1。未到達拒否はconstructor call 0、同期throwは試行1でも候補未取得を保持。二重・再入・flag復旧後の再試行0 |
| TA04 | run reject→resolve・cleanup resolveの全prefix | 各保持前後・退出で同参照／alias／位置と最初のfaultを照合。半捕捉の補完0、引数setter呼出し0、executor内の反射・copy・queue 0 |
| TA05 | candidate返却／throw・先行executor故障 | 返却unknownを確認前に保持し、生成失敗でも安全観測を分離。未返却値・無関係native Promise・unknown thenableを正規workへ採用しない |
| TA06 | 固定観測・同期／二重／後着反応 | 同work・同tuple・一度の登録、ack最大1。busy中の同期callを成功へせず、失敗／seal後も正規事実だけprivateに保持。value／reason hookと再登録0 |
| TA07 | 正常未dispatch候補と失敗候補の固定finally／drain | 正常に安全なwork／ackは試験終了前に有限終端確認。通知／copy／settle故障時も各責務を保持し、未確認を成功件数へ入れない。新timer・deadline再計算0 |
| TA08 | 独立oracle・semantic・構文正常変異 | 固定call窓拡大、entry claim省略、setter順序／alias／post省略、先行fault上書き、観測／終端資格の混同を検出。実行したactualを期待値へコピーしない |
| TA09 | source／固定dist・旧保証／配布 | source fallback・新export／friend／resolver登録口0。旧14本文・4export、strict raw・5fault・7permissions=falseを維持。元個別5秒／既定並列度・旧child60秒・製品全体60秒を変更しない |

型・origin leaf・段階別値postは、callを行わない閉鎖単位で先行実装できる。ただしその単位では既存request・3closureの固定拒否を残し、constructor／観測bodyへ分岐しない。次の実呼出し単位はCS04以降・安全な観測・固定abort／失敗終端までを一体で接続する。native Promise生成だけを試す中間状態を承認しない。

費目は同run／単一予算ownerのままで、新C/G/P/R成功credit・別予算・新clock／sample／floorを追加しない。同Pのconstructor試行、実返却candidate／work、観測派生ack、API／試験用wrapperのPromiseを別に計数する。aliasは別object数にしないが、保持参照による寿命延長は別に扱う。実backing容量、任意intrinsic破壊・OOM／process障害での完全回収、外側custody／最終discardはUnknownである。

## 8 draft-0.1作成時の静的確認と未実施範囲

基準HEADのliteral seed・同owner／unused post・閉鎖request／3closure、既存role型と先行保持、最新の閉鎖call oracleを読み、現行の拒否動作と将来の実行窓を分けた。SV／GW／CS／PP／FF／TAは設計IDであり、試験成功件数ではない。

draft-0.1作成時の変更は本書と親2文書だけとし、文書link／表／ID・差分・末尾改行・変更範囲を静的確認した。ソース・試験・CHANGELOG・依存・設定を変更せず、製品moduleのimport／実行、試験再実行・build／pack、Promise生成・closure呼出し、private公開・dispatch・実接続・実通信・設定変更・stage・コミット・Pushは行わなかった。

3文書のlocal link34件・表20個、新設計ID49個の順序／欠落／重複と末尾改行・差分空白を静的確認した。旧rootの内容は基準HEADと一致し、変更はMD3fileだけ、stage0である。これは文書整合の確認であり、将来のconstructor／executor・観測・終端を実行した結果ではない。

## 9 非実行variant・origin leaf・値postの限定実装

[旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)へreadonlyのJoinExecutionInspection／JoinExecutionValue／JoinExecutionAliasesを追加した。SV01〜08を判別する値投影であり、JoinExecutionSeedへのintersectionによるfalse／nullの解除はしない。実shell・RoleGenerationSlot・14個の期待aliasは従前のliteral閉鎖のままで、実行variantへのwriter・変換口・新shellは作らない。

joinExecutionOriginLeafは同roleのshell／identity／pin／slotとcanonical aliasを先に照合し、foreign・同値copy・Proxyのfieldを読まない。以後は保持済みの同root／seed／context・3closure／tuple参照だけを原始比較し、反射・live pin・時計・予算・snapshot・関数呼出しをしない。停止・sealed・current交換・failed_retained後も同保持originを照合できるが、新規生成やcallback書込みの資格ではない。元pendingを失えば、古い実参照を渡してもfalseである。既存handlerOriginMatchedや未使用checkerは変更しない。

joinExecutionValuePostはcreator内部のdata投影を対象とする。raw JSON／外部object用の入口ではなく、入力の型やboolean一致からauthorityを発行しない。値と期待aliasの同参照、constructor claim／entry／returnedとcandidateHeldの関係、runのrejectのみ→pair・cleanupのreject=null、保持位置とfaultAtの独立、失敗時unconfirmedを検査する。返却値はunknownのままなので、null／undefined／0を取得済みとして保持でき、未取得nullとcandidateHeldで区別する。値postは一切の入力・元slot・診断を書き換えない。

観測部分の値postは、未試行・registering・returned／threw／refused、ack未取得／喪失・候補保持・verifiedの関係を区別する。work・registrationWork・ackの同参照と有限値を比較するだけで、safe_same_work／verifiedという値をnative brand確認や登録実績へ昇格しない。PP06のnative安全検査、PP07の正規reaction入場とwriter、PP08の実drain／終端は未実装である。取得prefix・返却・未公開checked・失敗保持の値検査を、それらの実行成功とは扱わない。

登録状態と到達の関係は[未使用seed設計](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_EXECUTION_SEED_CONTRACT_DESIGN.md)EF06・ET01・ET02に従う。refusedは最終post拒否で到達false、returnedは到達true、registering（busy中）とthrewは到達前後のどちらも保持し得る。ackState=return_lostは到達後だけで、未到達のrefused／threw／registeringには置けない。値postはこの関係だけを確認し、実登録・ack実体の確認ではない。

既存requestJoinExecutionと3closureの本文は固定拒否のまま、draft-0.2時点で新2検査への製品callerは0だった。後続の閉鎖実field postだけがorigin leafを呼ぶが、そのpost自体と新failure／保持処理への製品callerは0である。正常なchecked投影を検査しても元shellのclaimはfalse、candidate等はnullのままで、request2経路とclosure6経路は従前の最初のfault／同期失効を保持する。新export・friend・raw mode・fake event writer・fixture台帳の共有は追加しない。

[source試験](../tests/review/native-join-execution-values.test.ts)、[独立値表／scratch境界](../tests/review/fixtures/native-join-execution-values-model.mjs)、[固定dist検査](../tests/review/fixtures/compiled-native-join-execution-values.mjs)と[検証記録](E2E_BEST_PRACTICE_NATIVE_JOIN_EXECUTION_VALUES_2026-11-17.md)を追加した。実行variantは将来契約の値検査であり、constructor／entry claim消費・settler捕捉・Promise生成・安全観測・固定abort／失敗終端・private公開・dispatchは引き続き未接続である。

## 10 同shellの実writer・安全観測／固定終端への受渡し（2026-11-18追記）

[同shellの実行writer・安全観測・固定終端受渡しの差分詳細設計draft-0.3](BEST_PRACTICE_NATIVE_DIAGNOSTIC_JRB_LIVE_WRITER_TERMINAL_HANDOFF_DELTA_DESIGN.md)で、§2の実shell／slot限定拡張と§4〜6を、実field post・writer資格・claim消費点・失敗prefixの受渡しへ具体化した。同書§9で同shellの実運用型・実field post・原始failure／cold未確認保持だけを合成依存限定で実装し、readonly値postをwriterにせず、ack保持途中と登録完了postを分離する。追加済みのslot拡張方針と既存固定拒否を維持し、取得claim・生成・観測・固定drain・private公開・dispatchは接続しない。
