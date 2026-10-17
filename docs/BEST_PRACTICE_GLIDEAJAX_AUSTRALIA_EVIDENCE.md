# Australia GlideAjax：scope・UI制約の調査記録

Version: glideajax-evidence-0.1 / 調査日: 2026-10-17。
調査主体: AIによる公式資料の読み取り。人の根拠採用・カード承認・実機確認は未実施。
[規則カード案](BEST_PRACTICE_RULE_CARDS_DRAFT.md) §5.1の補足資料。

## 1. 取得経路と資料の同定

docsサイトのAustralia固定URLは今回の取得ツールでは本文を取得できなかった。
代わりにServiceNow組織の公式ServiceNowDocsリポジトリのAustraliaブランチを読み、
ファイルのfront matterと本文を照合した。Community投稿・検索結果のAI要約は根拠に採用していない。
URLにaustraliaがあるだけでなく、両資料の`release: australia`、`locale: en-US`、
`last_updated: 2026-03-12`、canonical_urlを確認した。
これは公式公開文書の確認であり、人の採用承認ではない。

| ローカル調査ID | 公式本文の取得URL | canonical_url（今回本文取得不可） |
|---|---|---|
| GA-AU-API | [GlideAjax - Client / Australia](https://github.com/ServiceNow/ServiceNowDocs/blob/australia/markdown/api-reference/c_GlideAjaxAPI.md) | [Australia API](https://www.servicenow.com/docs/r/australia/api-reference/c_GlideAjaxAPI.html) |
| GA-AU-PORTAL | [Supported client script types and APIs / Australia](https://github.com/ServiceNow/ServiceNowDocs/blob/australia/markdown/platform-user-interface/service-portal/client-script-reference.md) | [Australia Service Portal](https://www.servicenow.com/docs/r/australia/platform-user-interface/service-portal/client-script-reference.html) |

調査IDは本記録だけの参照で、既存27規則台帳の採用済みsource_idを増やしたものではない。
GitHub URLは可変ブランチを指す。取得コミットSHA/本文ハッシュは未記録で、固定スナップショットとは呼ばない。
採用承認前に人が再取得し、必要な版固定・保存許諾・ハッシュ記録を行う。
リリース非固定docs URLは別リリースへ切り替わり得るためAustraliaの根拠として代用しない。

## 2. 該当箇所と確認した内容（独自要約）

| ID | 文書内のlocator | 内容と限界 |
|---|---|---|
| GA-AU-API / A1 | GlideAjax- Client → 使用手順の4番に続くNote | getXMLは非同期でクライアント処理を待たせないため推奨。getXMLWaitは順序を保証するが応答性を損なう可能性があり非推奨。Scopedアプリでは利用不可 |
| GA-AU-API / A2 | GlideAjax - getXMLWait() → 説明と直後のNote | 同期処理と応答性への影響、getXMLへの推奨、Scopedアプリでは利用不可という制約を再掲。UI製品ごとの対応一覧ではない |
| GA-AU-PORTAL / P1 | Supported client-side APIs → GlideAjax行のNote・第1項 | Service PortalではgetXMLWaitは動作しない。非同期getXML/getXMLAnswerへの置換を案内 |
| GA-AU-PORTAL / P2 | 同じGlideAjax行のNote・第2項 | Widget client controllerではGlideAjax自体を使えない。getXMLWaitだけの制約とは別 |
| GA-AU-PORTAL / P3 | Client script support in Service Portal、およびSupported client-side APIs冒頭 | UI TypeとAPI対応は別に確認する必要がある。API一覧はonLoad/onChange/onSubmitを対象としており、onSubmitだけgetXMLWaitを許可する記述はない |

AU-SRC-002の例コード中コメントとは別に、GA-AU-API本文は応答性への影響を明示している。
したがって、今後この補足根拠を人が採用すればUI影響を公式APIの説明として参照できる。
これによってAU-SRC-002のコメント自体が同じ詳細を述べていることにはならない。

## 3. scopeとUIの切り分け

| 確認軸・環境 | 文献での状態 | レビューでの扱い案 |
|---|---|---|
| Scopedアプリ | 利用不可：A1/A2 | 非同期推奨だけでなくAPI互換性の懸念として区別。スクリプトの実行scopeを照合する |
| Globalアプリ | API文書に同期メソッドとして説明あり、非推奨：A1/A2 | 全UIで利用可能とは推論しない。UI制約を別に照合する |
| Service Portal | getXMLWaitは動作しない：P1 | scopeとは独立したUI側の制約。Globalであっても許可へ反転させない |
| Service Portalのwidget client controller | GlideAjax自体を利用不可：P2 | 非同期APIへの機械的な置換も勧めない。別のAPI/設計の調査が必要 |
| Classic/Desktop | 今回の資料では専用の包括的対応保証は未確認 | Globalなら必ず動く、としない。推奨と対応保証を区別する |
| Agent/Configurable Workspace | 今回の資料では未確認 | Service Portalの制約を類推適用しない |
| Native Mobile/その他UI | Mobile環境への言及はあるが、個別製品・版ごとの対応は未確認 | Service Portalの説明を全Mobile製品の対応表として扱わない |
| scope/UI不明 | 対象コードへの制約適用は未確認 | API名だけで非対応環境と断定しない。不足メタデータを記録する |

Scopeは呼び出し元スクリプトのアプリ/実行文脈を確認する。呼び出すScript Includeのscopeだけから
クライアント側の利用可否を判定しない。UI Type=AllはすべてのAPIの対応を保証しない。
各軸を独立に記録し、Scoped＋Service Portalなら両根拠を残す。
この適用方法は本プロジェクトのレビュー案で、人の承認前に新しい確定判定へ実装しない。

## 4. カードへの反映・残る未確認事項

- 「非同期を優先する推奨」と「指定環境でAPI非対応」を別の根拠・所見として記録する。
- 実際の受信側、対象scope/UI、到達可能性、対象版が合わなければ「動かないことを実証済み」としない。
- onSubmitで同期を必要とするという業務要件は、自動的な例外承認・非対応制約の解除ではない。
  安全な代替設計・送信制御の方式は本調査では未確認であり、人の検討事項のままとする。
- Client Script以外の資産への規則拡張、新規互換性ルール/JSONコード、判定境界は未承認。
- 人の根拠採用、AU-SRC-002本文の再照合、資料の固定版保存、その他UI別の公式根拠は未完了。
- PDIでscope/UIごとの呼び出し実験は実施していない。認証・書き込み・MCP実装変更も行っていない。

既存の固定評価セット・検出器・台帳の27規則・承認状態は変更しない。
